import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadApiKey, parseBingDate, generateMockBingData } from '../scripts/automate-bing-issues.mjs';
import { loadIndexNowKey, discoverSitemapUrls, INDEXNOW_KEY } from '../scripts/submit-indexnow.mjs';

describe('Bing Webmaster Tools & IndexNow Automation Suite', () => {
  test('loadApiKey loads key from explicit argument or env', () => {
    const key = loadApiKey('explicit-test-key');
    assert.equal(key, 'explicit-test-key');
  });

  test('loadIndexNowKey resolves valid 32-character key', () => {
    const key = loadIndexNowKey();
    assert.ok(key && key.length === 32, 'IndexNow key should be 32 characters');
  });

  test('parseBingDate correctly parses Microsoft JSON Date format', () => {
    const epochMs = 1731657600000; // 2024-11-15
    const parsed = parseBingDate(`/Date(${epochMs})/`);
    assert.equal(parsed, '2024-11-15');
    assert.equal(parseBingDate('2026-11-15'), '2026-11-15');
    assert.equal(parseBingDate(null), 'Unknown');
  });

  test('generateMockBingData produces valid structure with 0 crawl issues', () => {
    const mock = generateMockBingData('https://testyourmicrophone.com');
    assert.equal(mock.verified, true);
    assert.equal(mock.crawlIssues.length, 0);
    assert.ok(mock.queryStats.length >= 3);
    assert.equal(mock.quota.DailyQuota, 100);
  });

  test('discoverSitemapUrls extracts valid URLs for testyourmicrophone.com', async () => {
    const urls = await discoverSitemapUrls('https://testyourmicrophone.com');
    assert.ok(Array.isArray(urls));
    assert.ok(urls.length >= 5);
    assert.ok(urls.some((u) => u.includes('windows-mic-test.html')));
    assert.ok(urls.some((u) => u.includes('teams-mic-test.html')));
  });
});
