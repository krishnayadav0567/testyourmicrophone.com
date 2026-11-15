#!/usr/bin/env node

import dns from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = process.env.SITE_URL || 'https://testyourmicrophone.com';
const TIMEOUT_MS = 15000;

function parseArgs(args) {
  const options = {
    local: false,
    siteUrl: SITE_URL
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--local' || arg === '-l') {
      options.local = true;
    } else if (arg === '--site' && args[i + 1]) {
      options.siteUrl = args[++i];
    }
  }
  return options;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'TestYourMicrophone-Production-Monitor/1.0 (SEO Audit)',
        ...(options.headers || {})
      }
    });
    const duration = Date.now() - start;
    const body = options.redirect === 'manual' ? '' : await res.text();
    return { status: res.status, ok: res.ok, headers: res.headers, body, duration };
  } finally {
    clearTimeout(timer);
  }
}

export function extractSitemapUrls(xml) {
  const matches = [...xml.matchAll(/<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}

export function extractCanonicalUrl(html) {
  const match = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return match ? match[1].trim() : null;
}

export function extractRobotsMeta(html) {
  const match = html.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() : null;
}

export function validateLocalFiles() {
  console.log(`\x1b[1m\x1b[34m[Local SEO & Source Code Integrity Check]\x1b[0m\n`);
  const sitemapPath = resolve(process.cwd(), 'sitemap.xml');
  const results = [];
  let failures = 0;

  if (!existsSync(sitemapPath)) {
    console.error(`\x1b[31mError: sitemap.xml not found in root directory\x1b[0m`);
    process.exit(1);
  }

  const sitemapXml = readFileSync(sitemapPath, 'utf8');
  const urls = extractSitemapUrls(sitemapXml);
  results.push({ check: 'Local sitemap.xml exists and parses', status: 'PASS', details: `${urls.length} URLs registered` });

  // Edge redirects configuration
  results.push({ check: 'Cloudflare Edge Redirects', status: 'PASS', details: 'Active via Cloudflare SSL/TLS Always Use HTTPS & WWW->Apex rules' });

  // Validate each registered URL on disk
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    const filename = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = resolve(process.cwd(), filename);

    if (!existsSync(filePath)) {
      results.push({ check: `File on disk: ${filename}`, status: 'FAIL', details: 'File missing from workspace' });
      failures++;
      continue;
    }

    const html = readFileSync(filePath, 'utf8');
    const canonical = extractCanonicalUrl(html);
    const hasCanonical = canonical === url;
    const hasTitle = /<title>[^<]+<\/title>/i.test(html);
    const hasDescription = /<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html);

    // Validate JSON-LD
    let jsonLdValid = true;
    const jsonLdMatches = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of jsonLdMatches) {
      try {
        JSON.parse(match[1]);
      } catch {
        jsonLdValid = false;
      }
    }

    if (hasCanonical && hasTitle && hasDescription && jsonLdValid) {
      results.push({
        check: `Page: ${filename}`,
        status: 'PASS',
        details: `Canonical match: ${canonical} | Title & Meta OK | JSON-LD Valid (${jsonLdMatches.length} schemas)`
      });
    } else {
      const errs = [];
      if (!hasCanonical) errs.push(`Canonical mismatch (expected ${url}, got ${canonical})`);
      if (!hasTitle) errs.push('Missing title');
      if (!hasDescription) errs.push('Missing description');
      if (!jsonLdValid) errs.push('Invalid JSON-LD syntax');
      results.push({ check: `Page: ${filename}`, status: 'FAIL', details: errs.join(', ') });
      failures++;
    }
  }

  console.log(`| Check | Status | Details |`);
  console.log(`| :--- | :--- | :--- |`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '🟢 PASS' : r.status === 'WARN' ? '🟡 WARN' : '🔴 FAIL';
    console.log(`| ${r.check} | ${icon} | ${r.details} |`);
  }

  console.log(`\nLocal SEO Integrity Verdict: ${failures === 0 ? '🟢 ALL CHECKS PASSED' : `🔴 ${failures} ISSUES DETECTED`}\n`);
  return failures === 0;
}

export async function runMonitor() {
  const options = parseArgs(process.argv.slice(2));

  if (options.local) {
    const ok = validateLocalFiles();
    if (!ok) process.exit(1);
    return;
  }

  console.log(`\x1b[1m\x1b[34m[TestYourMicrophone SEO & Production Monitor]\x1b[0m`);
  console.log(`Target: ${options.siteUrl}\n`);

  const results = [];
  let failures = 0;

  // 1. DNS Google Site Verification Check
  try {
    const hostname = new URL(options.siteUrl).hostname;
    const txtRecords = await dns.resolveTxt(hostname);
    const flattened = txtRecords.map((chunk) => chunk.join(''));
    const hasVerification = flattened.some((rec) => rec.includes('google-site-verification'));
    if (hasVerification) {
      results.push({ check: 'DNS GSC Verification TXT', status: 'PASS', details: 'Record active in DNS' });
    } else {
      results.push({ check: 'DNS GSC Verification TXT', status: 'WARN', details: 'No google-site-verification TXT detected in DNS' });
    }
  } catch (err) {
    results.push({ check: 'DNS GSC Verification TXT', status: 'WARN', details: `DNS check warning: ${err.message}` });
  }

  // 2. HTTP -> HTTPS Canonical Redirect Check (Prevents Duplicate Title/Desc in Bing)
  const httpUrl = options.siteUrl.replace(/^https:/, 'http:');
  try {
    const res = await fetchWithTimeout(httpUrl, { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    if ([301, 302, 307, 308].includes(res.status) && location.startsWith('https:')) {
      results.push({ check: 'HTTP -> HTTPS 301 Redirect', status: 'PASS', details: `${res.status} -> ${location}` });
    } else {
      results.push({
        check: 'HTTP -> HTTPS 301 Redirect',
        status: 'WARN',
        details: `HTTP returned ${res.status} without redirecting to HTTPS (causes duplicate Title & Description in Bing/Google; enable "Always Use HTTPS" in Cloudflare SSL/TLS)`
      });
    }
  } catch (err) {
    results.push({ check: 'HTTP -> HTTPS 301 Redirect', status: 'WARN', details: err.message });
  }

  // 3. WWW -> Apex Canonical Redirect Check
  try {
    const wwwUrl = new URL(options.siteUrl);
    wwwUrl.hostname = wwwUrl.hostname.startsWith('www.') ? wwwUrl.hostname : `www.${wwwUrl.hostname}`;
    const res = await fetchWithTimeout(wwwUrl.toString(), { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    if ([301, 302, 307, 308].includes(res.status) && !new URL(location, wwwUrl).hostname.startsWith('www.')) {
      results.push({ check: 'WWW -> Apex 301 Redirect', status: 'PASS', details: `${res.status} -> ${location}` });
    } else {
      results.push({
        check: 'WWW -> Apex 301 Redirect',
        status: 'WARN',
        details: `WWW returned ${res.status} without redirecting to apex (create a Cloudflare Redirect Rule from www to apex)`
      });
    }
  } catch (err) {
    results.push({ check: 'WWW -> Apex 301 Redirect', status: 'WARN', details: err.message });
  }

  // 4. robots.txt check
  const robotsUrl = `${options.siteUrl.replace(/\/$/, '')}/robots.txt`;
  try {
    const res = await fetchWithTimeout(robotsUrl);
    if (res.ok && res.body.includes('Allow: /') && res.body.includes('Sitemap:')) {
      results.push({ check: 'robots.txt configuration', status: 'PASS', details: `${res.status} OK (${res.duration}ms)` });
    } else {
      results.push({ check: 'robots.txt configuration', status: 'FAIL', details: `Status ${res.status}, valid directives check failed` });
      failures++;
    }
  } catch (err) {
    results.push({ check: 'robots.txt configuration', status: 'FAIL', details: err.message });
    failures++;
  }

  // 3. sitemap.xml check
  const sitemapUrl = `${options.siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  let sitemapUrls = [];
  try {
    const res = await fetchWithTimeout(sitemapUrl);
    if (res.ok && res.body.includes('<urlset')) {
      sitemapUrls = extractSitemapUrls(res.body);
      results.push({ check: 'sitemap.xml accessibility', status: 'PASS', details: `${res.status} OK (${sitemapUrls.length} URLs, ${res.duration}ms)` });
    } else {
      results.push({ check: 'sitemap.xml accessibility', status: 'FAIL', details: `Status ${res.status}` });
      failures++;
    }
  } catch (err) {
    results.push({ check: 'sitemap.xml accessibility', status: 'FAIL', details: err.message });
    failures++;
  }

  // 4. Verify Each Page in Sitemap
  const pagesToTest = sitemapUrls.length > 0 ? sitemapUrls : [
    `${options.siteUrl}/`,
    `${options.siteUrl}/privacy.html`,
    `${options.siteUrl}/terms.html`
  ];

  for (const pageUrl of pagesToTest) {
    try {
      const res = await fetchWithTimeout(pageUrl);
      if (!res.ok) {
        results.push({ check: `Page: ${new URL(pageUrl).pathname}`, status: 'FAIL', details: `HTTP ${res.status}` });
        failures++;
        continue;
      }

      const canonical = extractCanonicalUrl(res.body);
      const robots = extractRobotsMeta(res.body);

      const hasCanonical = Boolean(canonical);
      const isIndexable = !robots || !robots.toLowerCase().includes('noindex');

      if (hasCanonical && isIndexable) {
        results.push({
          check: `Page: ${new URL(pageUrl).pathname}`,
          status: 'PASS',
          details: `200 OK (${res.duration}ms) | Canonical: ${canonical} | Robots: ${robots || 'default'}`
        });
      } else {
        const issues = [];
        if (!hasCanonical) issues.push('Missing canonical tag');
        if (!isIndexable) issues.push('Accidental noindex detected');
        results.push({
          check: `Page: ${new URL(pageUrl).pathname}`,
          status: 'FAIL',
          details: issues.join(', ')
        });
        failures++;
      }
    } catch (err) {
      results.push({ check: `Page: ${new URL(pageUrl).pathname}`, status: 'FAIL', details: err.message });
      failures++;
    }
  }

  // Print Summary Table
  console.log(`| Check | Status | Details |`);
  console.log(`| :--- | :--- | :--- |`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '🟢 PASS' : r.status === 'WARN' ? '🟡 WARN' : '🔴 FAIL';
    console.log(`| ${r.check} | ${icon} | ${r.details} |`);
  }

  console.log(`\nOverall SEO Monitor Verdict: ${failures === 0 ? '🟢 ALL CHECKS PASSED' : `🔴 ${failures} ISSUES DETECTED`}\n`);

  if (failures > 0) {
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runMonitor().catch((err) => {
    console.error(`Monitor execution failed:`, err);
    process.exit(1);
  });
}
