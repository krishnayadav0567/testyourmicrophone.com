#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { findCredentialsPath, formatMarkdownReport } from './fetch-gsc-issues.mjs';
import { requestUrlIndexing, submitSitemapToSearchConsole } from './request-indexing.mjs';

const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const REPORT_OUTPUT_PATH = resolve(process.cwd(), 'reports/gsc-issues-report.md');
const HISTORY_OUTPUT_PATH = resolve(process.cwd(), 'reports/gsc-history.json');

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
    maxUrls: 20,
    requestIndexing: true,
    submitSitemap: true,
    webhookUrl: process.env.GSC_WEBHOOK_URL || null,
    strict: false,
    mock: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--credentials' && args[i + 1]) {
      options.credentialsPath = args[++i];
    } else if (arg === '--site' && args[i + 1]) {
      options.siteUrl = args[++i];
    } else if (arg === '--max-urls' && args[i + 1]) {
      options.maxUrls = parseInt(args[++i], 10) || 20;
    } else if (arg === '--no-indexing') {
      options.requestIndexing = false;
    } else if (arg === '--no-sitemap') {
      options.submitSitemap = false;
    } else if (arg === '--webhook' && args[i + 1]) {
      options.webhookUrl = args[++i];
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--mock') {
      options.mock = true;
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function diagnoseUrl(url) {
  const result = {
    url,
    httpStatus: null,
    ok: false,
    canonical: null,
    canonicalMatch: false,
    hasNoindex: false,
    hasTitle: false,
    title: '',
    contentLength: 0,
    errors: []
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TestYourMicrophone-GSC-Automator/1.0 (Audit)'
      }
    });
    clearTimeout(timeout);

    result.httpStatus = res.status;
    result.ok = res.ok;

    const xRobots = res.headers.get('x-robots-tag') || '';
    if (/noindex/i.test(xRobots)) {
      result.hasNoindex = true;
      result.errors.push(`Header x-robots-tag contains noindex: "${xRobots}"`);
    }

    const html = await res.text();
    result.contentLength = html.length;

    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
                           html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonicalMatch) {
      result.canonical = canonicalMatch[1];
      const normRequested = url.replace(/\/$/, '');
      const normCanonical = result.canonical.replace(/\/$/, '');
      result.canonicalMatch = normRequested === normCanonical;
      if (!result.canonicalMatch) {
        result.errors.push(`Canonical mismatch: declared "${result.canonical}", requested "${url}"`);
      }
    } else {
      result.errors.push('Missing <link rel="canonical"> tag');
    }

    const robotsMeta = html.match(/<meta[^>]+name=["'](robots|googlebot)["'][^>]+content=["']([^"']+)["']/i);
    if (robotsMeta && /noindex/i.test(robotsMeta[2])) {
      result.hasNoindex = true;
      result.errors.push(`Meta tag ${robotsMeta[1]} contains noindex: "${robotsMeta[2]}"`);
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      result.hasTitle = true;
      result.title = titleMatch[1].trim();
    } else {
      result.errors.push('Missing or empty <title> tag');
    }

    if (result.contentLength < 500) {
      result.errors.push(`Small HTML payload (${result.contentLength} bytes)`);
    }
  } catch (err) {
    result.errors.push(`Diagnostic fetch failed: ${err.message}`);
  }

  return result;
}

export function computeTrendDiff(currentResults, previousHistory = {}) {
  const previousMap = new Map((previousHistory.inspections || []).map((i) => [i.url, i]));

  const newlyIndexed = [];
  const newlyUnindexed = [];
  const persistentIssues = [];
  const resolvedIssues = [];

  for (const current of currentResults) {
    const isIndexedNow = current.coverageState?.toLowerCase().includes('indexed') &&
                         !current.coverageState?.toLowerCase().includes('not indexed');
    const prev = previousMap.get(current.url);

    if (prev) {
      const wasIndexed = prev.coverageState?.toLowerCase().includes('indexed') &&
                         !prev.coverageState?.toLowerCase().includes('not indexed');
      if (!wasIndexed && isIndexedNow) {
        newlyIndexed.push(current);
      } else if (wasIndexed && !isIndexedNow) {
        newlyUnindexed.push(current);
      } else if (!isIndexedNow) {
        persistentIssues.push(current);
      }
    } else {
      if (!isIndexedNow) {
        persistentIssues.push(current);
      }
    }
  }

  return {
    newlyIndexed,
    newlyUnindexed,
    persistentIssues,
    resolvedIssues
  };
}

export async function run() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`\x1b[1m\x1b[34m[TestYourMicrophone - GSC Full Automation Pipeline]\x1b[0m`);
  console.log(`Site: ${options.siteUrl}`);

  const reportsDir = resolve(process.cwd(), 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const credsPath = findCredentialsPath(options.credentialsPath);
  if (!credsPath) {
    console.error(`\x1b[31mError: No Google Search Console credentials found.\x1b[0m`);
    process.exit(1);
  }

  const keyData = JSON.parse(readFileSync(credsPath, 'utf8'));
  console.log(`Service Account: \x1b[36m${keyData.client_email}\x1b[0m`);

  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/indexing'
    ]
  });

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  // 1. Identify matched property
  const targetHost = new URL(options.siteUrl).hostname;
  let matchedProperty = options.siteUrl;

  try {
    const sitesRes = await searchconsole.sites.list();
    const siteEntries = sitesRes.data.siteEntry || [];
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
      matchedProperty = match.siteUrl;
      console.log(`\x1b[32m✔ Active Property:\x1b[0m ${matchedProperty} (${match.permissionLevel})`);
    }
  } catch (err) {
    console.warn(`Property list warning: ${err.message}`);
  }

  // 2. Submit sitemap
  const sitemapUrl = `${options.siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  let sitemaps = [];
  if (options.submitSitemap) {
    await submitSitemapToSearchConsole(auth, matchedProperty, sitemapUrl);
    try {
      const sitemapsRes = await searchconsole.sitemaps.list({ siteUrl: matchedProperty });
      sitemaps = sitemapsRes.data.sitemap || [];
    } catch {}
  }

  // 3. URLs to inspect
  const sitemapUrls = extractUrlsFromLocalSitemap();
  const urlsToInspect = sitemapUrls.length > 0 ? sitemapUrls : [
    `${options.siteUrl}/`,
    `${options.siteUrl}/windows-mic-test.html`,
    `${options.siteUrl}/mac-mic-test.html`,
    `${options.siteUrl}/teams-mic-test.html`,
    `${options.siteUrl}/airpods-mic-test.html`,
    `${options.siteUrl}/privacy.html`,
    `${options.siteUrl}/terms.html`
  ];

  console.log(`\nInspecting ${urlsToInspect.length} URLs via GSC URL Inspection API...`);
  const inspectionResults = [];
  const candidateIndexingUrls = [];

  for (const url of urlsToInspect.slice(0, options.maxUrls)) {
    process.stdout.write(`Inspecting ${url} ... `);
    try {
      const inspectRes = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: url,
          siteUrl: matchedProperty
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
      const isIndexed = item.coverageState.toLowerCase().includes('indexed') && !item.coverageState.toLowerCase().includes('not indexed');
      const color = isIndexed ? '\x1b[32m' : '\x1b[33m';
      console.log(`${color}${item.coverageState} (${item.verdict})\x1b[0m`);

      if (!isIndexed) {
        candidateIndexingUrls.push(url);
      }

      await sleep(150);
    } catch (err) {
      console.log(`\x1b[31mError: ${err.message}\x1b[0m`);
      inspectionResults.push({
        url,
        coverageState: `Inspection error: ${err.message}`,
        verdict: 'FAIL',
        pageFetchState: 'ERROR',
        indexingState: 'ERROR',
        mobileVerdict: 'FAIL',
        richResultsVerdict: 'FAIL'
      });
      candidateIndexingUrls.push(url);
    }
  }

  // 4. Trend diff against history
  let previousHistory = {};
  if (existsSync(HISTORY_OUTPUT_PATH)) {
    try {
      previousHistory = JSON.parse(readFileSync(HISTORY_OUTPUT_PATH, 'utf8'));
    } catch {}
  }

  const trend = computeTrendDiff(inspectionResults, previousHistory);
  console.log(`\nTrend Analysis:`);
  console.log(` - Newly Indexed:     ${trend.newlyIndexed.length}`);
  console.log(` - Newly Unindexed:   ${trend.newlyUnindexed.length}`);
  console.log(` - Persistent Issues: ${trend.persistentIssues.length}`);

  // 5. Auto-request Google Indexing for unindexed URLs
  if (options.requestIndexing && candidateIndexingUrls.length > 0) {
    console.log(`\nTriggering Google Indexing API recrawl for ${candidateIndexingUrls.length} page(s)...`);
    for (const url of candidateIndexingUrls) {
      process.stdout.write(`Requesting crawl for ${url} ... `);
      const indexRes = await requestUrlIndexing(auth, url, 'URL_UPDATED');
      if (indexRes.success) {
        console.log(`\x1b[32m✔ Crawl Requested\x1b[0m`);
      } else {
        console.log(`\x1b[33mNote: ${indexRes.error}\x1b[0m`);
      }
      await sleep(200);
    }
  }

  // 6. Fetch Search Analytics
  console.log(`\nFetching Search Analytics...`);
  let topQueries = [];
  let topPages = [];
  let summary = null;
  try {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.getTime() - 28 * 86400000).toISOString().split('T')[0];

    const [queriesRes, pagesRes, totalsRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: matchedProperty,
        requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 20 }
      }),
      searchconsole.searchanalytics.query({
        siteUrl: matchedProperty,
        requestBody: { startDate, endDate, dimensions: ['page'], rowLimit: 10 }
      }),
      searchconsole.searchanalytics.query({
        siteUrl: matchedProperty,
        requestBody: { startDate, endDate }
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
  } catch (err) {
    console.warn(`Search Analytics warning: ${err.message}`);
  }

  // 7. Save outputs
  const currentSnapshot = {
    recordedAt: new Date().toISOString(),
    inspections: inspectionResults,
    searchAnalytics: { summary, topQueries, topPages }
  };

  writeFileSync(HISTORY_OUTPUT_PATH, JSON.stringify(currentSnapshot, null, 2), 'utf8');

  const reportData = {
    siteUrl: options.siteUrl,
    matchedProperty,
    sitemaps,
    inspectionResults,
    searchAnalytics: { summary, topQueries, topPages }
  };

  const mdReport = formatMarkdownReport(reportData);
  writeFileSync(REPORT_OUTPUT_PATH, mdReport, 'utf8');

  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + mdReport + '\n', 'utf8'); } catch {}
  }

  console.log(`\x1b[32m✔ Report saved to:\x1b[0m ${REPORT_OUTPUT_PATH}`);
  console.log(`\x1b[32m✔ History snapshot saved to:\x1b[0m ${HISTORY_OUTPUT_PATH}`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().catch((err) => {
    console.error(`Automation failed:`, err);
    process.exit(1);
  });
}
