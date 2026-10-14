import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");

const siteFiles = [
  "index.html",
  "privacy.html",
  "terms.html",
  "app.js",
  "styles.css",
  "robots.txt",
  "sitemap.xml",
  ".nojekyll",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of siteFiles) {
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

await cp(path.join(projectRoot, "assets"), path.join(outputDirectory, "assets"), {
  recursive: true,
});

console.log(`Built static site in ${path.relative(projectRoot, outputDirectory)}/`);