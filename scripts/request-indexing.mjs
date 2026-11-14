#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const DEFAULT_SITEMAP_URL = `${DEFAULT_SITE_URL.replace(/\/$/, '')}/sitemap.xml`;

function parseArgs(args) {
  const options = {
    credentialsPath: null,
    siteUrl: DEFAULT_SITE_URL,
    sitemapUrl: DEFAULT_SITEMAP_URL,
    urls: [],
    submitSitemap: false,
    checkMetadata: false,
    type: 'URL_UPDATED'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--credentials' && args[i + 1]) {
      options.credentialsPath = args[++i];
    } else if (arg === '--site' && args[i + 1]) {
      options.siteUrl = args[++i];
    } else if (arg === '--sitemap' && args[i + 1]) {
      options.sitemapUrl = args[++i];
      options.submitSitemap = true;
    } else if (arg === '--submit-sitemap') {
      options.submitSitemap = true;
    } else if (arg === '--urls' && args[i + 1]) {
      options.urls = args[++i].split(',').map((u) => u.trim());
    } else if (arg === '--check') {
      options.checkMetadata = true;
    } else if (arg === '--type' && args[i + 1]) {
      options.type = args[++i].toUpperCase();
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function submitSitemapToSearchConsole(auth, siteUrl, sitemapUrl) {
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  let matchedSite = siteUrl;
  try {
    const sitesRes = await searchconsole.sites.list();
    const siteEntries = sitesRes.data.siteEntry || [];
    const match = siteEntries.find(
      (s) =>
        s.siteUrl === siteUrl ||
        s.siteUrl === `sc-domain:${new URL(siteUrl).hostname}` ||
        s.siteUrl.replace(/\/$/, '') === siteUrl.replace(/\/$/, '')
    );
    if (match) matchedSite = match.siteUrl;
  } catch {
    // fallback
  }

  console.log(`\nSubmitting sitemap to Google Search Console...`);
  console.log(` - Property: \x1b[36m${matchedSite}\x1b[0m`);
  console.log(` - Sitemap:  \x1b[36m${sitemapUrl}\x1b[0m`);

  try {
    const res = await searchconsole.sitemaps.submit({
      siteUrl: matchedSite,
      feedpath: sitemapUrl
    });
    console.log(`\x1b[32m✔ Sitemap successfully submitted to Google Search Console (HTTP ${res.status || 204})\x1b[0m`);
    return { success: true, status: res.status || 204 };
  } catch (err) {
    console.error(`\x1b[31m✖ Failed to submit sitemap:\x1b[0m ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function requestUrlIndexing(auth, url, type = 'URL_UPDATED') {
  const indexing = google.indexing({ version: 'v3', auth });

  try {
    const res = await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type
      }
    });

    const notifyTime = res.data.urlNotificationMetadata?.latestUpdate?.notifyTime || new Date().toISOString();
    return {
      success: true,
      url,
      type,
      notifyTime
    };
  } catch (err) {
    return {
      success: false,
      url,
      type,
      error: err.message
    };
  }
}

export async function getUrlIndexingMetadata(auth, url) {
  const indexing = google.indexing({ version: 'v3', auth });
  try {
    const res = await indexing.urlNotifications.getMetadata({ url });
    return { success: true, url, data: res.data };
  } catch (err) {
    return { success: false, url, error: err.message };
  }
}

export async function run() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`\x1b[1m\x1b[34m[Google Recrawl / Indexing Request Tool]\x1b[0m`);

  const credsPath = findCredentialsPath(options.credentialsPath);
  if (!credsPath) {
    console.error(`\x1b[31mError: No Google Service Account credentials found.\x1b[0m`);
    process.exit(1);
  }

  const keyData = JSON.parse(readFileSync(credsPath, 'utf-8'));
  console.log(`Using Service Account: \x1b[36m${keyData.client_email}\x1b[0m`);

  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/indexing'
    ]
  });

  // Action 1: Submit sitemap if requested or if no specific URLs provided
  if (options.submitSitemap || options.urls.length === 0) {
    await submitSitemapToSearchConsole(auth, options.siteUrl, options.sitemapUrl);
  }

  // Action 2: Process individual URLs
  if (options.urls.length > 0) {
    console.log(`\nProcessing ${options.urls.length} URL(s) via Google Indexing API...`);
    let apiDisabledWarningShown = false;

    for (const url of options.urls) {
      if (options.checkMetadata) {
        process.stdout.write(`Checking metadata for ${url} ... `);
        const meta = await getUrlIndexingMetadata(auth, url);
        if (meta.success) {
          console.log(`\x1b[32m✔ OK\x1b[0m`, JSON.stringify(meta.data.latestUpdate || meta.data));
        } else {
          console.log(`\x1b[31m✖ Error: ${meta.error}\x1b[0m`);
        }
      } else {
        process.stdout.write(`Requesting recrawl (${options.type}) for ${url} ... `);
        const result = await requestUrlIndexing(auth, url, options.type);
        if (result.success) {
          console.log(`\x1b[32m✔ Requested (Notify Time: ${result.notifyTime})\x1b[0m`);
        } else {
          console.log(`\x1b[31m✖ Error: ${result.error}\x1b[0m`);
          if (result.error?.includes('Web Search Indexing API has not been used') && !apiDisabledWarningShown) {
            apiDisabledWarningShown = true;
            console.log(`
\x1b[33m[Action Needed to enable direct Indexing API notifications]:\x1b[0m
Visit Google Cloud Console to enable the Web Search Indexing API with 1-click:
\x1b[36mhttps://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=${keyData.project_id}\x1b[0m
Once enabled, Googlebot will accept instant URL recrawl pings directly!
`);
          }
        }
      }
      await sleep(250);
    }
  }

  console.log(`\n\x1b[32m✔ Completed.\x1b[0m`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().catch((err) => {
    console.error(`Unexpected failure:`, err);
    process.exit(1);
  });
}
