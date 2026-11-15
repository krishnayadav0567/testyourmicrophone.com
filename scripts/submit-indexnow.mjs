#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSitemapUrls } from './monitor-production.mjs';

export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '8f4e2a9c1b7d450398a6b5c4d3e2f1a0';
const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const DEFAULT_ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow'];

export function loadIndexNowKey(explicitKey) {
  if (explicitKey) return explicitKey;
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;

  for (const envFile of ['.env.local', '.env']) {
    const fullPath = resolve(process.cwd(), envFile);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      const match = content.match(/^INDEXNOW_KEY\s*=\s*(["']?)([^"'\r\n]+)\1/m);
      if (match && match[2].trim()) {
        return match[2].trim();
      }
    }
  }

  return INDEXNOW_KEY;
}

function parseArgs(args) {
  const options = {
    siteUrl: DEFAULT_SITE_URL,
    key: loadIndexNowKey(),
    urls: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--site' && args[i + 1]) {
      options.siteUrl = args[++i];
    } else if (arg === '--key' && args[i + 1]) {
      options.key = args[++i];
    } else if (arg === '--urls' && args[i + 1]) {
      options.urls = args[++i]
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
    }
  }

  return options;
}

export async function discoverSitemapUrls(siteUrl) {
  const localSitemap = resolve(process.cwd(), 'sitemap.xml');
  if (existsSync(localSitemap)) {
    try {
      const xml = readFileSync(localSitemap, 'utf8');
      const urls = extractSitemapUrls(xml);
      if (urls.length > 0) return urls;
    } catch {
      // Fallback to fetch
    }
  }

  const normalizedBase = siteUrl.replace(/\/$/, '');
  const sitemapUrl = `${normalizedBase}/sitemap.xml`;
  try {
    const res = await fetch(sitemapUrl, {
      headers: {
        accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'TestYourMicrophone-IndexNow/1.0'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return extractSitemapUrls(xml);
  } catch {
    return [
      `${normalizedBase}/`,
      `${normalizedBase}/windows-mic-test.html`,
      `${normalizedBase}/mac-mic-test.html`,
      `${normalizedBase}/teams-mic-test.html`,
      `${normalizedBase}/airpods-mic-test.html`,
      `${normalizedBase}/privacy.html`,
      `${normalizedBase}/terms.html`
    ];
  }
}

/**
 * @param {{siteUrl?: string; key?: string; urls?: string[]; endpoints?: string[]}} [options]
 */
export async function submitIndexNow({
  siteUrl = DEFAULT_SITE_URL,
  key = loadIndexNowKey(),
  urls = [],
  endpoints = DEFAULT_ENDPOINTS
} = {}) {
  const normalizedBase = siteUrl.replace(/\/$/, '');
  const host = new URL(normalizedBase).hostname;
  const keyLocation = `${normalizedBase}/${key}.txt`;
  const urlList = urls.length > 0 ? [...new Set(urls)] : await discoverSitemapUrls(normalizedBase);

  const payload = {
    host,
    key,
    keyLocation,
    urlList
  };

  const results = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'TestYourMicrophone-IndexNow/1.0'
        },
        body: JSON.stringify(payload)
      });

      const bodyText = await res.text().catch(() => '');
      results.push({
        endpoint,
        status: res.status,
        ok: res.ok || res.status === 200 || res.status === 202,
        body: bodyText
      });
    } catch (err) {
      results.push({
        endpoint,
        status: 0,
        ok: false,
        error: err.message
      });
    }
  }

  const success = results.some((r) => r.ok);
  return {
    success,
    host,
    key,
    keyLocation,
    submittedCount: urlList.length,
    urls: urlList,
    results
  };
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`\x1b[1m\x1b[36m[IndexNow URL Submission Engine]\x1b[0m Host: \x1b[32m${new URL(opts.siteUrl).hostname}\x1b[0m`);
  submitIndexNow(opts)
    .then((out) => {
      console.log(`Key: ${out.key} (${out.keyLocation})`);
      console.log(`Submitted URLs (${out.submittedCount}):`);
      out.urls.forEach((u) => console.log(` - ${u}`));
      console.log('\nEndpoints:');
      out.results.forEach((r) => {
        const icon = r.ok ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✖ FAIL\x1b[0m';
        console.log(` ${icon} [${r.status || 'ERR'}] ${r.endpoint}`);
      });
      process.exit(out.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('IndexNow failed:', err);
      process.exit(1);
    });
}
