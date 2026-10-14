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

## Project files

- `index.html` — homepage, SEO metadata, visible FAQs, and structured data
- `app.js` — microphone permissions, live analysis, device selection, recording, theme, and reveal behavior
- `styles.css` — responsive layout, themes, hero, FAQ, and animations
- `privacy.html` — privacy policy
- `terms.html` — terms page
- `assets/` — favicon and social preview images