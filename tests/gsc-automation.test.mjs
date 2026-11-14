import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrendDiff } from '../scripts/automate-gsc-issues.mjs';
import { findCredentialsPath } from '../scripts/fetch-gsc-issues.mjs';
import { extractSitemapUrls, extractCanonicalUrl, extractRobotsMeta } from '../scripts/monitor-production.mjs';

describe('GSC Automation & SEO Tooling Suite', () => {
  test('findCredentialsPath returns null on invalid path', () => {
    const credsPath = findCredentialsPath('/non/existent/path.json');
    assert.equal(credsPath, null);
  });

  test('computeTrendDiff computes accurate newlyIndexed, newlyUnindexed, and persistentIssues', () => {
    const previousHistory = {
      inspections: [
        {
          url: 'https://testyourmicrophone.com/windows-mic-test.html',
          coverageState: 'URL is unknown to Google'
        },
        {
          url: 'https://testyourmicrophone.com/',
          coverageState: 'Submitted and indexed'
        },
        {
          url: 'https://testyourmicrophone.com/terms.html',
          coverageState: 'Submitted and indexed'
        }
      ]
    };

    const currentResults = [
      {
        url: 'https://testyourmicrophone.com/windows-mic-test.html',
        coverageState: 'Submitted and indexed' // Newly indexed!
      },
      {
        url: 'https://testyourmicrophone.com/',
        coverageState: 'Submitted and indexed' // Retained
      },
      {
        url: 'https://testyourmicrophone.com/terms.html',
        coverageState: 'Crawled - currently not indexed' // Newly regressed!
      },
      {
        url: 'https://testyourmicrophone.com/mac-mic-test.html',
        coverageState: 'URL is unknown to Google' // Persistent / new issue
      }
    ];

    const { newlyIndexed, newlyUnindexed, persistentIssues } = computeTrendDiff(currentResults, previousHistory);

    assert.equal(newlyIndexed.length, 1);
    assert.equal(newlyIndexed[0].url, 'https://testyourmicrophone.com/windows-mic-test.html');

    assert.equal(newlyUnindexed.length, 1);
    assert.equal(newlyUnindexed[0].url, 'https://testyourmicrophone.com/terms.html');

    assert.equal(persistentIssues.length, 1);
    assert.equal(persistentIssues[0].url, 'https://testyourmicrophone.com/mac-mic-test.html');
  });

  test('extractSitemapUrls extracts valid URLs from sitemap XML string', () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://testyourmicrophone.com/</loc></url>
        <url><loc>https://testyourmicrophone.com/windows-mic-test.html</loc></url>
      </urlset>
    `;
    const urls = extractSitemapUrls(xml);
    assert.deepEqual(urls, [
      'https://testyourmicrophone.com/',
      'https://testyourmicrophone.com/windows-mic-test.html'
    ]);
  });

  test('extractCanonicalUrl correctly identifies canonical tag', () => {
    const html = `
      <html>
        <head>
          <link rel="canonical" href="https://testyourmicrophone.com/windows-mic-test.html" />
        </head>
      </html>
    `;
    const canonical = extractCanonicalUrl(html);
    assert.equal(canonical, 'https://testyourmicrophone.com/windows-mic-test.html');
  });

  test('extractRobotsMeta correctly extracts robots content', () => {
    const html = `
      <html>
        <head>
          <meta name="robots" content="index, follow" />
        </head>
      </html>
    `;
    const robots = extractRobotsMeta(html);
    assert.equal(robots, 'index, follow');
  });
});
