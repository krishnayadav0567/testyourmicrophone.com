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

This is a static site with a zero-dependency build command. To build the deployable files into `dist/`:

```bash
npm run build
```

For local development without a build step, start a static server from the project root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages deployment

The repository includes `.github/workflows/deploy-pages.yml`. After pushing the `main` branch to GitHub:

1. Open the repository's **Settings**.
2. Open **Pages** under **Code and automation**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or run the workflow manually from the **Actions** tab.

The workflow runs `npm run build` and publishes the generated `dist/` directory as a static GitHub Pages site.

## Custom domain

The site currently uses `https://testyourmicrophone.com/` in its canonical URL, sitemap, robots file, and social metadata. If the GitHub Pages site will use this domain, configure the domain in GitHub Pages and point the domain DNS records to GitHub before launch. If you use a different domain, update those files before publishing.

## Project files

- `index.html` — homepage, SEO metadata, visible FAQs, and structured data
- `app.js` — microphone permissions, live analysis, device selection, recording, theme, and reveal behavior
- `styles.css` — responsive layout, themes, hero, FAQ, and animations
- `privacy.html` — privacy policy
- `terms.html` — terms page
- `assets/` — favicon and social preview images