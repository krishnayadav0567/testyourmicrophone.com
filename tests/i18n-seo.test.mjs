import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageList, allLocales } from '../scripts/locale-data-definitions.mjs';
import { extractSitemapUrls, extractCanonicalUrl } from '../scripts/monitor-production.mjs';

const projectRoot = resolve(fileURLToPath(import.meta.url), '../../');
const distDir = resolve(projectRoot, 'dist');

describe('Multilingual SEO Architecture Suite (32 Languages)', () => {
  test('all 32 languages are registered in definitions', () => {
    assert.equal(languageList.length, 32);
    assert.equal(Object.keys(allLocales).length, 32);
  });

  test('all 32 languages have rich metadata and valid direction', () => {
    for (const lang of languageList) {
      const locale = allLocales[lang.code];
      assert.ok(locale, `Missing locale object for ${lang.code}`);
      assert.ok(locale.meta.title && locale.meta.title.length > 10, `Title too short for ${lang.code}`);
      assert.ok(locale.meta.description && locale.meta.description.length > 25, `Description too short for ${lang.code}`);
      assert.ok(locale.ui.startTest, `Missing startTest UI string for ${lang.code}`);
      assert.ok(locale.faqs.length >= 10, `Expected at least 10 FAQs for ${lang.code}, got ${locale.faqs.length}`);
      assert.ok(locale.dir === 'ltr' || locale.dir === 'rtl', `Invalid text direction for ${lang.code}`);
    }
  });

  test('Arabic and Hebrew are correctly marked as RTL', () => {
    assert.equal(allLocales['ar'].dir, 'rtl');
    assert.equal(allLocales['he'].dir, 'rtl');
  });

  test('sitemap.xml registers all 162 URLs (32 homepages + 128 specialized + 2 legal)', () => {
    const sitemapPath = resolve(distDir, 'sitemap.xml');
    assert.ok(existsSync(sitemapPath), 'dist/sitemap.xml should exist');
    const xml = readFileSync(sitemapPath, 'utf8');
    const urls = extractSitemapUrls(xml);
    assert.equal(urls.length, 162, `Expected 162 URLs in sitemap, got ${urls.length}`);
    assert.ok(urls.includes('https://testyourmicrophone.com/'));
    assert.ok(urls.includes('https://testyourmicrophone.com/de/'));
    assert.ok(urls.includes('https://testyourmicrophone.com/de/windows-mic-test.html'));
    assert.ok(urls.includes('https://testyourmicrophone.com/ja/mac-mic-test.html'));
    assert.ok(urls.includes('https://testyourmicrophone.com/ar/'));
  });

  test('every language page on disk has self-canonical, 33 hreflang tags, and 4 valid JSON-LD schemas', () => {
    for (const lang of languageList) {
      const pageRelPath = lang.path ? `${lang.path}/index.html` : 'index.html';
      const pageDiskPath = resolve(distDir, pageRelPath);
      assert.ok(existsSync(pageDiskPath), `File missing: dist/${pageRelPath}`);

      const html = readFileSync(pageDiskPath, 'utf8');
      const expectedUrl = lang.path ? `https://testyourmicrophone.com/${lang.path}/` : 'https://testyourmicrophone.com/';

      // 1. Self-canonical
      const canonical = extractCanonicalUrl(html);
      assert.equal(canonical, expectedUrl, `Canonical mismatch for ${lang.code}`);

      // 2. Reciprocal hreflangs (x-default + 32 languages = 33 tags)
      const hreflangMatches = [...html.matchAll(/<link\b[^>]*hreflang=["']([^"']+)["'][^>]*>/gi)];
      assert.equal(hreflangMatches.length, 33, `Expected 33 hreflang tags in ${pageRelPath}, found ${hreflangMatches.length}`);

      // 3. JSON-LD Schemas (WebApplication, FAQPage, BreadcrumbList, HowTo)
      const jsonLdMatches = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      assert.equal(jsonLdMatches.length, 4, `Expected 4 JSON-LD schemas in ${pageRelPath}, found ${jsonLdMatches.length}`);
      for (const match of jsonLdMatches) {
        assert.doesNotThrow(() => JSON.parse(match[1]), `Invalid JSON-LD syntax in ${pageRelPath}`);
      }
    }
  });

  test('no generated HTML page contains the literal string "undefined"', () => {
    const pageTypes = ['', 'windows-mic-test.html', 'mac-mic-test.html', 'teams-mic-test.html', 'airpods-mic-test.html'];
    for (const lang of languageList) {
      for (const pt of pageTypes) {
        const file = lang.path
          ? (pt ? `${lang.path}/${pt}` : `${lang.path}/index.html`)
          : (pt || 'index.html');
        const diskPath = resolve(distDir, file);
        assert.ok(existsSync(diskPath), `Missing file: dist/${file}`);
        const html = readFileSync(diskPath, 'utf8');
        assert.ok(!html.includes('>undefined<'), `Found >undefined< in dist/${file}`);
        assert.ok(!html.includes('undefined →'), `Found undefined arrow button in dist/${file}`);
        assert.ok(!html.includes('"undefined"'), `Found "undefined" attribute in dist/${file}`);
      }
    }
  });
});
