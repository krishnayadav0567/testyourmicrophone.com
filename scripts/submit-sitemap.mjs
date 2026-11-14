#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { findCredentialsPath } from './fetch-gsc-issues.mjs';

const SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const SITEMAP_URL = `${SITE_URL.replace(/\/$/, '')}/sitemap.xml`;

export async function submitSitemap() {
  console.log(`\x1b[1m\x1b[34m[GSC Sitemap Submitter]\x1b[0m`);
  console.log(`Target Site: ${SITE_URL}`);
  console.log(`Sitemap:     ${SITEMAP_URL}`);

  const credsPath = findCredentialsPath();
  if (!credsPath) {
    console.error(`\x1b[31mError: No Google Search Console credentials found.\x1b[0m`);
    process.exit(1);
  }

  const keyData = JSON.parse(readFileSync(credsPath, 'utf8'));
  console.log(`Service Account: \x1b[36m${keyData.client_email}\x1b[0m`);

  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters']
  });

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  // Resolve property
  const targetHost = new URL(SITE_URL).hostname;
  let matchedProperty = SITE_URL;

  try {
    const sitesRes = await searchconsole.sites.list();
    const siteEntries = sitesRes.data.siteEntry || [];
    const match = siteEntries.find((s) => {
      const url = s.siteUrl || '';
      return (
        url === `sc-domain:${targetHost}` ||
        url === SITE_URL ||
        url === `${SITE_URL}/` ||
        url.replace(/\/$/, '') === SITE_URL.replace(/\/$/, '')
      );
    });

    if (match) {
      matchedProperty = match.siteUrl;
      console.log(`\x1b[32m✔ Active Property:\x1b[0m ${matchedProperty}`);
    } else {
      console.warn(`\x1b[33mWarning: Property "${targetHost}" not found in authorized list.\x1b[0m`);
      console.warn(`Ensure ${keyData.client_email} is added to GSC property permissions.`);
    }

    console.log(`Submitting sitemap "${SITEMAP_URL}" to ${matchedProperty}...`);
    await searchconsole.sitemaps.submit({
      siteUrl: matchedProperty,
      feedpath: SITEMAP_URL
    });

    console.log(`\x1b[32m✔ Sitemap submitted successfully to Google Search Console!\x1b[0m`);

    // Verify sitemaps list
    const listRes = await searchconsole.sitemaps.list({ siteUrl: matchedProperty });
    console.log(`Registered sitemaps in GSC:`, listRes.data.sitemap || []);
  } catch (err) {
    console.error(`\x1b[31mSubmission failed:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  submitSitemap().catch((err) => {
    console.error(`Unexpected failure:`, err);
    process.exit(1);
  });
}
