import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAllLanguages } from './build-i18n.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'dist');

const siteFiles = [
  'index.html',
  'windows-mic-test.html',
  'mac-mic-test.html',
  'teams-mic-test.html',
  'airpods-mic-test.html',
  'privacy.html',
  'terms.html',
  'app.js',
  'styles.css',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  '8f4e2a9c1b7d450398a6b5c4d3e2f1a0.txt',
  '.nojekyll'
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of siteFiles) {
  const src = path.join(projectRoot, file);
  if (existsSync(src)) {
    await cp(src, path.join(outputDirectory, file));
  }
}

const assetsDir = path.join(projectRoot, 'assets');
if (existsSync(assetsDir)) {
  await cp(assetsDir, path.join(outputDirectory, 'assets'), { recursive: true });
}

// Generate static multilingual versions for 32 languages + sitemap.xml
await buildAllLanguages();

console.log(`✔ Built static distribution in ${path.relative(projectRoot, outputDirectory)}/`);
