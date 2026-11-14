# TestYourMicrophone.com

Privacy-first browser microphone testing site.

## Features

- Live microphone level meter
- Input device selection
- Local recording and playback
- No microphone audio upload
- Dark and light themes
- Responsive full-screen hero
- Scroll-reveal content with reduced-motion support
- SEO metadata and FAQ structured data

## Run locally

This is a static site and does not require a build step or package installation. Start a local static server from the project root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Cloudflare Pages deployment

This repository is a plain static site and does not require npm, a package manager, or a build command.

In Cloudflare Pages, connect this GitHub repository with:

- **Production branch:** `main`
- **Framework preset:** `None`
- **Build command:** leave blank
- **Build output directory:** `/`

Cloudflare Pages will publish the repository root, where `index.html` is located. After the first deployment, add `testyourmicrophone.com` as a custom domain in the Cloudflare Pages project.

## Custom domain

The site currently uses `https://testyourmicrophone.com/` in its canonical URL, sitemap, robots file, and social metadata. Configure this domain as the Cloudflare Pages custom domain before submitting the sitemap to Google Search Console.

## Google Analytics and Search Console

Google Analytics 4 is installed on the homepage, privacy policy, and terms pages with measurement ID `G-5L01FMWM1L`. The privacy policy explains the analytics data and cookie use.

For Google Search Console, add a **Domain property** for `testyourmicrophone.com`. Verify ownership by adding the TXT record Google provides to the domain's DNS records in Cloudflare. The record is added at the DNS layer; do not replace it with a made-up value or add a verification tag to the site. After DNS verification succeeds, submit:

`https://testyourmicrophone.com/sitemap.xml`

## Google Search Console & SEO Automation

The repository includes automated tools to audit technical SEO health, submit sitemaps, inspect indexing status, and pull Search Analytics via the Google Search Console API.

### 1. Granting Search Console API Access

If using a service account (e.g. `gsc-reader@online-stopwatch-timer.iam.gserviceaccount.com` or your own Google Cloud service account):

1. Open [Google Search Console](https://search.google.com/search-console).
2. Select the `testyourmicrophone.com` property (`sc-domain:testyourmicrophone.com` or `https://testyourmicrophone.com/`).
3. Navigate to **Settings** > **Users and permissions** > **Add user**.
4. Enter the service account email (e.g. `gsc-reader@online-stopwatch-timer.iam.gserviceaccount.com`).
5. Select **Full** (allows sitemap submission and URL inspection) or **Restricted** (read-only).
6. Save the service account JSON key as `gsc-credentials.json` in the project root (it is git-ignored).

### 2. Available Commands

```bash
# Run production SEO & live health audit (validates DNS TXT, robots.txt, sitemap.xml, canonical tags)
npm run monitor:production

# Fetch Google Search Console index status, URL inspections & search analytics
npm run gsc:fetch

# Test GSC report generation in dry-run/mock mode (no credentials required)
npm run gsc:mock

# Submit or refresh sitemap.xml in Google Search Console
npm run gsc:submit
```

### 3. Automated Scheduled Monitoring

A GitHub Actions workflow is configured at `.github/workflows/production-monitor.yml`:
- Runs 4 times daily and on manual trigger (`workflow_dispatch`).
- Audits live sitemaps, robots.txt, and canonical tags.
- Automatically generates diagnostic reports in the GitHub Actions summary.
- Automatically opens or updates a GitHub Issue if technical SEO failures are detected.
- To enable automated GSC fetching in GitHub Actions, add your service account JSON contents to GitHub Repository Secrets as `GSC_CREDENTIALS`.

## Project files

- `index.html` — homepage, SEO metadata, visible FAQs, and structured data
- `app.js` — microphone permissions, live analysis, device selection, recording, theme, and reveal behavior
- `styles.css` — responsive layout, themes, hero, FAQ, and animations
- `privacy.html` — privacy policy
- `terms.html` — terms page
- `assets/` — favicon and social preview images