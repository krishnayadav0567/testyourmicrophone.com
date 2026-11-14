#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const REPORT_OUTPUT_PATH = resolve(process.cwd(), 'reports/gsc-issues-report.md');
const JSON_OUTPUT_PATH = resolve(process.cwd(), 'reports/gsc-data.json');
const HISTORY_FILE_PATH = resolve(process.cwd(), 'reports/gsc-history.json');

// Default target canonical routes for testyourmicrophone.com
const DEFAULT_SAMPLE_ROUTES = [
  '/',
  '/windows-mic-test.html',
  '/mac-mic-test.html',
  '/teams-mic-test.html',
  '/airpods-mic-test.html',
  '/privacy.html',
  '/terms.html'
];

function extractUrlsFromLocalSitemap() {
  const sitemapPath = resolve(process.cwd(), 'sitemap.xml');
  if (!existsSync(sitemapPath)) return [];
  try {
    const xml = readFileSync(sitemapPath, 'utf8');
    const matches = [...xml.matchAll(/<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi)];
    return [...new Set(matches.map((m) => m[1].trim()))];
  } catch {
    return [];
  }
}

function parseArgs(args) {
  const options = {
    credentialsPath: null,
    siteUrl: DEFAULT_SITE_URL,
    maxUrls: 15,
    mock: false,
    submitSitemap: false,
    urls: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--credentials' && args[i + 1]) {
      options.credentialsPath = args[++i];
    } else if (arg === '--site' && args[i + 1]) {
      options.siteUrl = args[++i];
    } else if (arg === '--max-urls' && args[i + 1]) {
      options.maxUrls = parseInt(args[++i], 10) || 15;
    } else if (arg === '--mock' || arg === '--dry-run') {
      options.mock = true;
    } else if (arg === '--submit-sitemap') {
      options.submitSitemap = true;
    } else if (arg === '--urls' && args[i + 1]) {
      options.urls = args[++i].split(',').map((u) => u.trim());
    }
  }

  return options;
}

export function findCredentialsPath(explicitPath) {
  if (explicitPath) {
    return existsSync(explicitPath) ? resolve(explicitPath) : null;
  }
  if (process.env.GSC_CREDENTIALS_PATH && existsSync(process.env.GSC_CREDENTIALS_PATH)) {
    return resolve(process.env.GSC_CREDENTIALS_PATH);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  const standardCandidates = [
    resolve(process.cwd(), 'gsc-credentials.json'),
    resolve(process.cwd(), 'service-account.json'),
    resolve(process.cwd(), 'gsc-service-account.json'),
    resolve(process.cwd(), 'google-credentials.json'),
    resolve(process.cwd(), '../online-stopwatch-timer/gsc-credentials.json')
  ];

  for (const candidate of standardCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function printSetupInstructions(serviceAccountEmail) {
  const emailText = serviceAccountEmail || 'your-service-account@project.iam.gserviceaccount.com';
  console.log(`
\x1b[1m\x1b[33m[Google Search Console API - Property Access Required]\x1b[0m

To connect testyourmicrophone.com to Google Search Console API:

1. \x1b[1mOpen Google Search Console:\x1b[0m
   https://search.google.com/search-console

2. \x1b[1mSelect your property:\x1b[0m
   - Domain property: \x1b[36msc-domain:testyourmicrophone.com\x1b[0m
   - OR URL-prefix property: \x1b[36mhttps://testyourmicrophone.com/\x1b[0m

3. \x1b[1mAdd Service Account User:\x1b[0m
   - Go to \x1b[1mSettings\x1b[0m > \x1b[1mUsers and permissions\x1b[0m > \x1b[1mAdd user\x1b[0m.
   - Email address: \x1b[32m${emailText}\x1b[0m
   - Permission: \x1b[1mFull\x1b[0m (allows sitemap submission & inspections) or \x1b[1mRestricted\x1b[0m (read-only).
   - Click \x1b[1mAdd\x1b[0m.

4. \x1b[1mRun the automation tool:\x1b[0m
   npm run gsc:fetch

\x1b[32mTip:\x1b[0m You can test report generation immediately in mock mode using:
   \x1b[1mnpm run gsc:mock\x1b[0m
`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function compareHistory(currentData) {
  if (!existsSync(HISTORY_FILE_PATH)) return null;
  try {
    const prev = JSON.parse(readFileSync(HISTORY_FILE_PATH, 'utf8'));
    const prevSummary = prev.searchAnalytics?.summary || {};
    const currSummary = currentData.searchAnalytics?.summary || {};

    const prevQueries = new Set((prev.searchAnalytics?.topQueries || []).map((q) => q.keys?.[0]));
    const currQueries = currentData.searchAnalytics?.topQueries || [];
    const newQueries = currQueries.filter((q) => !prevQueries.has(q.keys?.[0])).map((q) => q.keys?.[0]);

    return {
      impressionsDelta: (currSummary.impressions || 0) - (prevSummary.impressions || 0),
      clicksDelta: (currSummary.clicks || 0) - (prevSummary.clicks || 0),
      newQueries,
      lastRecordedAt: prev.recordedAt || null
    };
  } catch {
    return null;
  }
}

export function generateMockReport(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  return {
    siteUrl,
    matchedProperty: `sc-domain:${new URL(siteUrl).hostname}`,
    sitemaps: [
      {
        path: `${base}/sitemap.xml`,
        lastSubmitted: new Date(Date.now() - 2 * 86400000).toISOString(),
        lastDownloaded: new Date(Date.now() - 1 * 86400000).toISOString(),
        isPending: false,
        warnings: 0,
        errors: 0,
        contents: [{ type: 'web', submitted: '7', indexed: '7' }]
      }
    ],
    inspectionResults: [
      {
        url: `${base}/`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/`,
        userCanonical: `${base}/`,
        lastCrawlTime: new Date(Date.now() - 12 * 3600000).toISOString()
      },
      {
        url: `${base}/windows-mic-test.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/windows-mic-test.html`,
        userCanonical: `${base}/windows-mic-test.html`,
        lastCrawlTime: new Date(Date.now() - 24 * 3600000).toISOString()
      },
      {
        url: `${base}/mac-mic-test.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/mac-mic-test.html`,
        userCanonical: `${base}/mac-mic-test.html`,
        lastCrawlTime: new Date(Date.now() - 24 * 3600000).toISOString()
      },
      {
        url: `${base}/teams-mic-test.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/teams-mic-test.html`,
        userCanonical: `${base}/teams-mic-test.html`,
        lastCrawlTime: new Date(Date.now() - 24 * 3600000).toISOString()
      },
      {
        url: `${base}/airpods-mic-test.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/airpods-mic-test.html`,
        userCanonical: `${base}/airpods-mic-test.html`,
        lastCrawlTime: new Date(Date.now() - 24 * 3600000).toISOString()
      },
      {
        url: `${base}/privacy.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/privacy.html`,
        userCanonical: `${base}/privacy.html`,
        lastCrawlTime: new Date(Date.now() - 48 * 3600000).toISOString()
      },
      {
        url: `${base}/terms.html`,
        coverageState: 'Submitted and indexed',
        verdict: 'PASS',
        pageFetchState: 'SUCCESSFUL',
        indexingState: 'INDEXING_ALLOWED',
        crawledAs: 'MOBILE',
        mobileVerdict: 'PASS',
        richResultsVerdict: 'PASS',
        googleCanonical: `${base}/terms.html`,
        userCanonical: `${base}/terms.html`,
        lastCrawlTime: new Date(Date.now() - 48 * 3600000).toISOString()
      }
    ],
    searchAnalytics: {
      summary: {
        clicks: 142,
        impressions: 4890,
        ctr: 0.029,
        position: 14.2
      },
      topQueries: [
        { keys: ['test your microphone'], clicks: 58, impressions: 1650, ctr: 0.035, position: 9.8 },
        { keys: ['mic test online'], clicks: 34, impressions: 1200, ctr: 0.028, position: 12.4 },
        { keys: ['test microphone windows 10'], clicks: 22, impressions: 780, ctr: 0.028, position: 15.1 },
        { keys: ['how to test mic on laptop'], clicks: 16, impressions: 640, ctr: 0.025, position: 16.5 },
        { keys: ['test mic mac'], clicks: 12, impressions: 620, ctr: 0.019, position: 17.3 }
      ],
      topPages: [
        { keys: [`${base}/`], clicks: 142, impressions: 4890, ctr: 0.029, position: 14.2 }
      ]
    }
  };
}

export function formatMarkdownReport(data, historyComparison = null) {
  const timestamp = new Date().toISOString();
  const { siteUrl, matchedProperty, sitemaps = [], inspectionResults = [], searchAnalytics } = data;

  const totalInspected = inspectionResults.length;
  const indexedCount = inspectionResults.filter(
    (r) => r.coverageState?.toLowerCase().includes('indexed') && !r.coverageState?.toLowerCase().includes('not indexed')
  ).length;
  const crawledNotIndexed = inspectionResults.filter(
    (r) => r.coverageState?.toLowerCase().includes('crawled - currently not indexed')
  ).length;
  const discoveredNotIndexed = inspectionResults.filter(
    (r) => r.coverageState?.toLowerCase().includes('discovered - currently not indexed')
  ).length;
  const unknownToGoogle = inspectionResults.filter(
    (r) => r.coverageState?.toLowerCase().includes('unknown to google')
  ).length;
  const serverErrors = inspectionResults.filter(
    (r) => r.coverageState?.toLowerCase().includes('5xx') || r.pageFetchState?.toLowerCase().includes('server_error')
  ).length;
  const issues = inspectionResults.filter(
    (r) => r.verdict !== 'PASS' || !r.coverageState?.toLowerCase().includes('indexed') || r.coverageState?.toLowerCase().includes('not indexed')
  );
  const sitemapIssues = sitemaps.reduce((acc, s) => acc + Number(s.errors || 0) + Number(s.warnings || 0), 0);

  let md = `# Google Search Console Report — TestYourMicrophone.com\n\n`;
  md += `**Target Site:** \`${siteUrl}\`  \n`;
  if (matchedProperty) {
    md += `**Matched Property:** \`${matchedProperty}\`  \n`;
  }
  md += `**Report Generated At:** ${timestamp}  \n`;
  md += `**Total URLs Sampled:** ${totalInspected}  \n\n`;

  md += `## 1. Executive Summary\n\n`;
  md += `| Metric | Count | Status |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **Indexed (Valid)** | ${indexedCount} / ${totalInspected} | ${indexedCount === totalInspected ? '🟢 Fully Indexed' : '🟡 Review Needed'} |\n`;
  md += `| **Crawled - Currently Not Indexed** | ${crawledNotIndexed} | ${crawledNotIndexed > 0 ? '🟡 Monitored' : '🟢 None'} |\n`;
  md += `| **Discovered - Currently Not Indexed** | ${discoveredNotIndexed} | ${discoveredNotIndexed > 0 ? '🟡 Queued for Crawling' : '🟢 None'} |\n`;
  md += `| **URL is Unknown to Google** | ${unknownToGoogle} | ${unknownToGoogle > 0 ? '🟡 Discovery Queued' : '🟢 None'} |\n`;
  md += `| **Server Errors (5xx)** | ${serverErrors} | ${serverErrors > 0 ? '🔴 Critical Error' : '🟢 0 Detected'} |\n`;
  md += `| **Sitemap Errors / Warnings** | ${sitemapIssues} | ${sitemapIssues === 0 ? '🟢 Healthy' : '🔴 Errors Detected'} |\n\n`;

  // History comparison
  if (historyComparison) {
    const impSign = historyComparison.impressionsDelta >= 0 ? '+' : '';
    const clickSign = historyComparison.clicksDelta >= 0 ? '+' : '';
    md += `### Period-over-Period Performance Changes\n\n`;
    md += `- **Impressions Change:** ${impSign}${historyComparison.impressionsDelta}\n`;
    md += `- **Clicks Change:** ${clickSign}${historyComparison.clicksDelta}\n`;
    if (historyComparison.newQueries?.length > 0) {
      md += `- **Newly Discovered Queries:** ${historyComparison.newQueries.map((q) => `\`${q}\``).join(', ')}\n`;
    }
    md += `\n`;
  }

  // Domain cannibalization check
  const topPagesList = searchAnalytics?.topPages || [];
  const hasWww = topPagesList.some((p) => p.keys?.[0]?.includes('www.testyourmicrophone.com'));
  const hasApex = topPagesList.some((p) => p.keys?.[0]?.startsWith('https://testyourmicrophone.com'));
  if (hasWww && hasApex) {
    md += `> [!TIP]\n> **Domain Equity Consolidation**: Search analytics detected impressions split between \`www.testyourmicrophone.com\` and \`testyourmicrophone.com\`. A Cloudflare Pages \`_redirects\` rule has been placed to issue 301 permanent redirects from \`www\` to apex, uniting link equity upon next deployment.\n\n`;
  }

  md += `## 2. Sitemaps Status\n\n`;
  if (sitemaps.length === 0) {
    md += `> [!WARNING]\n> No sitemaps found registered in Google Search Console for this property.\n> Submit your sitemap: \`${siteUrl}/sitemap.xml\` using \`npm run gsc:submit\`.\n\n`;
  } else {
    md += `| Sitemap URL | Last Downloaded | Submitted URLs | Indexed URLs | Errors | Warnings |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const sm of sitemaps) {
      const submitted = sm.contents?.[0]?.submitted ?? sm.submitted ?? 'N/A';
      const indexed = sm.contents?.[0]?.indexed ?? sm.indexed ?? 'N/A';
      md += `| \`${sm.path}\` | ${sm.lastDownloaded || 'Pending'} | ${submitted} | ${indexed} | ${sm.errors || 0} | ${sm.warnings || 0} |\n`;
    }
    md += `\n`;
  }

  md += `## 3. URL Inspection Verdicts & Issues\n\n`;
  if (issues.length === 0) {
    md += `> [!NOTE]\n> All inspected URLs are healthy and verified with status \`Submitted and indexed\`!\n\n`;
  } else {
    md += `| URL | Coverage State | Verdict | Fetch State | Mobile Usability | Canonical Match |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const item of issues) {
      const canonicalMatch = item.googleCanonical && item.userCanonical && item.googleCanonical === item.userCanonical ? '✅ Yes' : '⚠️ Mismatch';
      md += `| \`${item.url}\` | **${item.coverageState}** | \`${item.verdict}\` | \`${item.pageFetchState}\` | \`${item.mobileVerdict}\` | ${canonicalMatch} |\n`;
    }
    md += `\n`;
  }

  md += `## 4. Inspected URL Details\n\n`;
  md += `| URL | Coverage State | Verdict | Last Crawled | Crawled As |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const item of inspectionResults) {
    md += `| \`${item.url}\` | ${item.coverageState} | \`${item.verdict}\` | ${item.lastCrawlTime || 'Pending Crawl'} | ${item.crawledAs || 'Googlebot'} |\n`;
  }
  md += `\n`;

  if (searchAnalytics?.topQueries?.length > 0 || searchAnalytics?.topPages?.length > 0) {
    md += `## 5. Search Analytics (Last 28 Days)\n\n`;
    if (searchAnalytics.summary) {
      const { clicks, impressions, ctr, position } = searchAnalytics.summary;
      md += `| Total Clicks | Total Impressions | Average CTR | Average Position |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      md += `| **${clicks}** | **${impressions}** | **${(ctr * 100).toFixed(1)}%** | **${position.toFixed(1)}** |\n\n`;
    }

    if (searchAnalytics.topQueries?.length > 0) {
      md += `### Top Google Search Queries\n\n`;
      md += `| Query | Clicks | Impressions | CTR | Position |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const q of searchAnalytics.topQueries) {
        const queryText = q.keys?.[0] || 'N/A';
        const ctr = (Number(q.ctr || 0) * 100).toFixed(1) + '%';
        const pos = Number(q.position || 0).toFixed(1);
        md += `| **${queryText}** | ${q.clicks} | ${q.impressions} | ${ctr} | ${pos} |\n`;
      }
      md += `\n`;
    }

    if (searchAnalytics.topPages?.length > 0) {
      md += `### Top Landing Pages\n\n`;
      md += `| Page URL | Clicks | Impressions | CTR | Position |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const p of searchAnalytics.topPages) {
        const pageUrl = p.keys?.[0] || 'N/A';
        const ctr = (Number(p.ctr || 0) * 100).toFixed(1) + '%';
        const pos = Number(p.position || 0).toFixed(1);
        md += `| \`${pageUrl}\` | ${p.clicks} | ${p.impressions} | ${ctr} | ${pos} |\n`;
      }
      md += `\n`;
    }
  }

  md += `## 6. Actionable Next Steps\n\n`;
  if (crawledNotIndexed > 0) {
    md += `- **Crawled - currently not indexed:** Google has crawled these pages. Enhance internal linking, expand unique content sections, and ensure rich FAQ schema.\n`;
  }
  if (discoveredNotIndexed > 0 || unknownToGoogle > 0) {
    md += `- **Discovered / Unknown to Google:** New landing pages queued for indexing. Keep sitemap refreshed via \`npm run gsc:submit\`.\n`;
  }
  if (serverErrors > 0) {
    md += `- **Server Error (5xx):** Inspect Cloudflare status and HTTP edge responses.\n`;
  }
  if (sitemaps.length === 0) {
    md += `- **Submit Sitemap:** Submit \`${siteUrl}/sitemap.xml\` using \`npm run gsc:submit\`.\n`;
  }
  if (issues.length === 0 && sitemaps.length > 0) {
    md += `- **All clear:** All sampled URLs are indexed and performing properly. Monitor regularly via \`npm run gsc:fetch\`.\n`;
  }

  return md;
}

export async function run() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`\x1b[1m\x1b[34m[GSC Fetch Tool]\x1b[0m Target Site: ${options.siteUrl}`);

  const reportsDir = resolve(process.cwd(), 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  if (options.mock) {
    console.log(`\x1b[33mRunning in MOCK / DRY-RUN mode...\x1b[0m`);
    const mockData = generateMockReport(options.siteUrl);
    const md = formatMarkdownReport(mockData);

    writeFileSync(REPORT_OUTPUT_PATH, md, 'utf-8');
    writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(mockData, null, 2), 'utf-8');

    if (process.env.GITHUB_STEP_SUMMARY) {
      try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + md + '\n', 'utf8'); } catch {}
    }

    console.log(`\x1b[32m✔ Mock report successfully generated at:\x1b[0m ${REPORT_OUTPUT_PATH}`);
    console.log(`\x1b[32m✔ JSON data written to:\x1b[0m ${JSON_OUTPUT_PATH}`);
    console.log(`\n--- Summary ---`);
    console.log(`Total Inspected: ${mockData.inspectionResults.length}`);
    console.log(`Indexed (Valid): ${mockData.inspectionResults.filter((r) => r.verdict === 'PASS').length}`);
    return;
  }

  const credsPath = findCredentialsPath(options.credentialsPath);
  if (!credsPath) {
    printSetupInstructions();
    process.exit(1);
  }

  console.log(`\x1b[32m✔ Credentials found:\x1b[0m ${credsPath}`);

  let keyData;
  try {
    keyData = JSON.parse(readFileSync(credsPath, 'utf-8'));
    console.log(`Service Account: \x1b[36m${keyData.client_email}\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31mFailed to parse credentials JSON:\x1b[0m ${err.message}`);
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/webmasters.readonly'
    ]
  });

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  // 1. Verify site property access
  console.log(`\nVerifying authorized Search Console properties...`);
  let matchedSiteUrl = options.siteUrl;
  const targetHost = new URL(options.siteUrl).hostname;

  try {
    const sitesRes = await searchconsole.sites.list();
    const siteEntries = sitesRes.data.siteEntry || [];

    if (siteEntries.length === 0) {
      console.warn(`\x1b[33mWarning: Service account has no verified sites in Search Console.\x1b[0m`);
      printSetupInstructions(keyData.client_email);
      process.exit(1);
    }

    console.log(`Authorized properties:`);
    for (const s of siteEntries) {
      console.log(` - ${s.siteUrl} (${s.permissionLevel})`);
    }

    // Match domain property or URL prefix property
    const match = siteEntries.find((s) => {
      const url = s.siteUrl || '';
      return (
        url === `sc-domain:${targetHost}` ||
        url === options.siteUrl ||
        url === `${options.siteUrl}/` ||
        url.replace(/\/$/, '') === options.siteUrl.replace(/\/$/, '')
      );
    });

    if (match) {
      matchedSiteUrl = match.siteUrl;
      console.log(`\x1b[32m✔ Matched active property:\x1b[0m ${matchedSiteUrl} (${match.permissionLevel})`);
    } else {
      console.warn(`\x1b[33mProperty matching "${targetHost}" was not found in authorized properties list.\x1b[0m`);
      printSetupInstructions(keyData.client_email);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\x1b[31mError querying GSC site properties:\x1b[0m ${err.message}`);
    if (err.message.includes('permission') || err.message.includes('403')) {
      printSetupInstructions(keyData.client_email);
    }
    process.exit(1);
  }

  // 2. Fetch or Submit Sitemaps
  console.log(`\nFetching registered sitemaps for ${matchedSiteUrl}...`);
  let sitemaps = [];
  try {
    const sitemapsRes = await searchconsole.sitemaps.list({ siteUrl: matchedSiteUrl });
    sitemaps = sitemapsRes.data.sitemap || [];
    console.log(`Found ${sitemaps.length} registered sitemap(s).`);

    if (options.submitSitemap || sitemaps.length === 0) {
      const sitemapFeed = `${options.siteUrl.replace(/\/$/, '')}/sitemap.xml`;
      console.log(`Submitting sitemap: ${sitemapFeed} ...`);
      try {
        await searchconsole.sitemaps.submit({
          siteUrl: matchedSiteUrl,
          feedpath: sitemapFeed
        });
        console.log(`\x1b[32m✔ Sitemap submitted successfully!\x1b[0m`);
        const refreshed = await searchconsole.sitemaps.list({ siteUrl: matchedSiteUrl });
        sitemaps = refreshed.data.sitemap || sitemaps;
      } catch (submitErr) {
        console.warn(`Sitemap submission note: ${submitErr.message}`);
      }
    }
  } catch (err) {
    console.warn(`Could not query sitemaps: ${err.message}`);
  }

  // 3. URLs to Inspect
  const baseUrl = options.siteUrl.replace(/\/$/, '');
  let targetUrls = [];

  if (options.urls.length > 0) {
    targetUrls = options.urls;
  } else {
    const localSitemapUrls = extractUrlsFromLocalSitemap();
    if (localSitemapUrls.length > 0) {
      targetUrls = localSitemapUrls;
    } else {
      targetUrls = DEFAULT_SAMPLE_ROUTES;
    }
  }

  const urlsToInspect = targetUrls
    .slice(0, options.maxUrls)
    .map((r) => (r.startsWith('http') ? r : `${baseUrl}${r.startsWith('/') ? '' : '/'}${r}`));

  console.log(`\nInspecting ${urlsToInspect.length} URLs (GSC URL Inspection API)...`);
  const inspectionResults = [];

  for (const url of urlsToInspect) {
    process.stdout.write(`Inspecting ${url} ... `);
    try {
      const inspectRes = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: url,
          siteUrl: matchedSiteUrl
        }
      });

      const res = inspectRes.data.inspectionResult || {};
      const status = res.indexStatusResult || {};
      const mobile = res.mobileUsabilityResult || {};
      const rich = res.richResultsResult || {};

      const item = {
        url,
        coverageState: status.coverageState || 'Unknown',
        verdict: status.verdict || 'NEUTRAL',
        pageFetchState: status.pageFetchState || 'UNKNOWN',
        indexingState: status.indexingState || 'UNKNOWN',
        crawledAs: status.crawledAs || 'MOBILE',
        lastCrawlTime: status.lastCrawlTime || null,
        googleCanonical: status.googleCanonical || null,
        userCanonical: status.userCanonical || null,
        mobileVerdict: mobile.verdict || 'PASS',
        richResultsVerdict: rich.verdict || 'PASS'
      };

      inspectionResults.push(item);
      const color = item.verdict === 'PASS' ? '\x1b[32m' : '\x1b[33m';
      console.log(`${color}${item.coverageState} (${item.verdict})\x1b[0m`);

      await sleep(150);
    } catch (err) {
      console.log(`\x1b[31mError: ${err.message}\x1b[0m`);
      inspectionResults.push({
        url,
        coverageState: `Inspection error: ${err.message}`,
        verdict: 'FAIL',
        pageFetchState: 'ERROR',
        indexingState: 'ERROR',
        crawledAs: 'UNKNOWN',
        mobileVerdict: 'FAIL',
        richResultsVerdict: 'FAIL'
      });
    }
  }

  // 4. Fetch Search Analytics (last 28 days)
  console.log(`\nFetching Search Analytics performance...`);
  let topQueries = [];
  let topPages = [];
  let summary = null;

  try {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.getTime() - 28 * 86400000).toISOString().split('T')[0];

    const [queriesRes, pagesRes, totalsRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: matchedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['query'],
          rowLimit: 20
        }
      }),
      searchconsole.searchanalytics.query({
        siteUrl: matchedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['page'],
          rowLimit: 10
        }
      }),
      searchconsole.searchanalytics.query({
        siteUrl: matchedSiteUrl,
        requestBody: {
          startDate,
          endDate
        }
      })
    ]);

    topQueries = queriesRes.data.rows || [];
    topPages = pagesRes.data.rows || [];
    const totalRow = totalsRes.data.rows?.[0];
    if (totalRow) {
      summary = {
        clicks: totalRow.clicks || 0,
        impressions: totalRow.impressions || 0,
        ctr: totalRow.ctr || 0,
        position: totalRow.position || 0
      };
    }
    console.log(`Retrieved ${topQueries.length} top search queries and ${topPages.length} landing pages.`);
  } catch (err) {
    console.warn(`Search Analytics query note: ${err.message}`);
  }

  // 5. History Comparison & Save
  const currentSnapshot = {
    recordedAt: new Date().toISOString(),
    searchAnalytics: {
      summary,
      topQueries,
      topPages
    }
  };

  const historyComparison = compareHistory(currentSnapshot);
  writeFileSync(HISTORY_FILE_PATH, JSON.stringify(currentSnapshot, null, 2), 'utf-8');

  // 6. Save Reports
  const reportData = {
    siteUrl: options.siteUrl,
    matchedProperty: matchedSiteUrl,
    sitemaps,
    inspectionResults,
    searchAnalytics: {
      summary,
      topQueries,
      topPages
    }
  };

  const mdReport = formatMarkdownReport(reportData, historyComparison);
  writeFileSync(REPORT_OUTPUT_PATH, mdReport, 'utf-8');
  writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(reportData, null, 2), 'utf-8');

  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + mdReport + '\n', 'utf8'); } catch {}
  }

  console.log(`\n\x1b[32m✔ Search Console report written to:\x1b[0m ${REPORT_OUTPUT_PATH}`);
  console.log(`\x1b[32m✔ Search Console JSON data saved to:\x1b[0m ${JSON_OUTPUT_PATH}`);

  const issues = inspectionResults.filter((r) => r.verdict !== 'PASS');
  console.log(`\nInspection Summary:`);
  console.log(` - Total Sampled: ${inspectionResults.length}`);
  console.log(` - Valid / Indexed: ${inspectionResults.length - issues.length}`);
  console.log(` - Needs Attention: ${issues.length}`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().catch((err) => {
    console.error(`Unexpected failure:`, err);
    process.exit(1);
  });
}
