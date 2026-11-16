import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageList, allLocales } from './locale-data-definitions.mjs';

const projectRoot = resolve(fileURLToPath(import.meta.url), '../../');
const distDir = resolve(projectRoot, 'dist');
const SITE_URL = 'https://testyourmicrophone.com';

export function buildHreflangTags(pageFile = '') {
  const xDefaultUrl = pageFile ? `${SITE_URL}/${pageFile}` : `${SITE_URL}/`;
  const tags = [
    `  <link rel="alternate" hreflang="x-default" href="${xDefaultUrl}" />`,
    ...languageList.map((lang) => {
      const url = lang.path
        ? (pageFile ? `${SITE_URL}/${lang.path}/${pageFile}` : `${SITE_URL}/${lang.path}/`)
        : (pageFile ? `${SITE_URL}/${pageFile}` : `${SITE_URL}/`);
      return `  <link rel="alternate" hreflang="${lang.code}" href="${url}" />`;
    })
  ];
  return tags.join('\n');
}

export function buildSitemapXml() {
  const specializedPages = [
    'windows-mic-test.html',
    'mac-mic-test.html',
    'teams-mic-test.html',
    'airpods-mic-test.html'
  ];
  const legalUrls = [
    { path: 'privacy.html', changefreq: 'monthly', priority: '0.3' },
    { path: 'terms.html', changefreq: 'monthly', priority: '0.3' }
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;

  // 1. Homepages (32 languages with reciprocal hreflangs)
  for (const lang of languageList) {
    const pageUrl = lang.path ? `${SITE_URL}/${lang.path}/` : `${SITE_URL}/`;
    const priority = lang.code === 'en' ? '1.0' : '0.9';
    xml += `  <url>\n`;
    xml += `    <loc>${pageUrl}</loc>\n`;
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />\n`;
    for (const alt of languageList) {
      const altUrl = alt.path ? `${SITE_URL}/${alt.path}/` : `${SITE_URL}/`;
      xml += `    <xhtml:link rel="alternate" hreflang="${alt.code}" href="${altUrl}" />\n`;
    }
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // 2. Specialized Pages (Windows, Mac, Teams, AirPods across all 32 languages)
  for (const pageFile of specializedPages) {
    for (const lang of languageList) {
      const pageUrl = lang.path ? `${SITE_URL}/${lang.path}/${pageFile}` : `${SITE_URL}/${pageFile}`;
      xml += `  <url>\n`;
      xml += `    <loc>${pageUrl}</loc>\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/${pageFile}" />\n`;
      for (const alt of languageList) {
        const altUrl = alt.path ? `${SITE_URL}/${alt.path}/${pageFile}` : `${SITE_URL}/${pageFile}`;
        xml += `    <xhtml:link rel="alternate" hreflang="${alt.code}" href="${altUrl}" />\n`;
      }
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `  </url>\n`;
    }
  }

  // 3. Legal pages
  for (const item of legalUrls) {
    xml += `  <url>\n`;
    xml += `    <loc>${SITE_URL}/${item.path}</loc>\n`;
    xml += `    <changefreq>${item.changefreq}</changefreq>\n`;
    xml += `    <priority>${item.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>\n`;
  return xml;
}

export function generatePageHtml(locale, pageType = 'home') {
  const { code, path, name, dir, meta, ui, content, faqs, schemas } = locale;
  const isRtl = dir === 'rtl';

  const pageFiles = {
    home: '',
    windows: 'windows-mic-test.html',
    mac: 'mac-mic-test.html',
    teams: 'teams-mic-test.html',
    airpods: 'airpods-mic-test.html'
  };
  const pageFile = pageFiles[pageType] || '';
  const pageUrl = path
    ? (pageFile ? `${SITE_URL}/${path}/${pageFile}` : `${SITE_URL}/${path}/`)
    : (pageFile ? `${SITE_URL}/${pageFile}` : `${SITE_URL}/`);

  const hreflangs = buildHreflangTags(pageFile);

  let pageTitle = meta.title;
  let pageDescription = meta.description;
  let heroBadge = content.privacyBadge;
  let heroHeading = `<h1>${content.heroHeading} <span>${content.heroHeadingAccent}</span></h1>`;
  let heroDescription = content.heroDescription;
  let startBtnLabel = ui.startTest || 'Start microphone test';

  const subpageConfigs = {
    windows: {
      en: {
        title: 'How to Test Microphone on Windows 10 & 11 | Free PC Mic Test',
        description: 'Free microphone test for Windows 10, Windows 11, and PC laptops. Test Realtek, USB, or wireless headsets instantly with live dBFS meter and playback.',
        badge: 'Windows 10 & 11 • 100% Local',
        heading: '<h1>Test your microphone on <span>Windows</span></h1>',
        heroDescription: 'Free, private microphone test for Windows 10, Windows 11, and PC laptops. Test Realtek, USB, or wireless headsets instantly without opening confusing settings—verify dBFS levels and hear what others hear.',
        button: 'Start Windows mic test'
      },
      hi: {
        title: 'Windows 10 और 11 पर माइक टेस्ट करें | Free PC Mic Test',
        description: 'Windows 10, 11 और PC लैपटॉप पर माइक टेस्ट करें। लाइव वेवफ़ॉर्म और तुरंत प्लेबैक के साथ Realtek या USB माइक की आवाज़ जाँचें।',
        badge: 'Windows 10 और 11 • 100% सुरक्षित व लोकल',
        heading: '<h1><span>Windows</span> पर माइक टेस्ट करें</h1>',
        heroDescription: 'Windows 10, Windows 11 और PC लैपटॉप के लिए मुफ़्त और 100% प्राइवेट माइक टेस्ट। Realtek, USB या वायरलेस हेडसेट की आवाज़ तुरंत चेक करें।',
        button: 'Windows माइक टेस्ट शुरू करें'
      }
    },
    mac: {
      en: {
        title: 'How to Test Microphone on Mac & Safari | Free macOS Mic Test',
        description: 'Private microphone test for macOS, MacBook, iMac, and Safari. Test built-in and external microphones with live decibel feedback and zero uploads.',
        badge: 'macOS & Safari • 100% Local',
        heading: '<h1>Test your microphone on <span>Mac</span></h1>',
        heroDescription: 'Private, browser-based microphone test for macOS, MacBook, and Safari. Check built-in and external USB microphones with real-time level meters and instant audio playback.',
        button: 'Start Mac mic test'
      },
      hi: {
        title: 'Mac और Safari पर माइक टेस्ट करें | Free macOS Mic Test',
        description: 'macOS, MacBook, iMac और Safari के लिए प्राइवेट माइक टेस्ट। इनबिल्ट और USB माइक की लाइव आवाज़ जाँचें।',
        badge: 'macOS और Safari • 100% सुरक्षित व लोकल',
        heading: '<h1><span>Mac और Safari</span> पर माइक टेस्ट करें</h1>',
        heroDescription: 'macOS, MacBook और Safari के लिए 100% प्राइवेट ब्राउज़र माइक टेस्ट। इनबिल्ट और USB माइक की लाइव वेवफ़ॉर्म और प्लेबैक तुरंत सुनें।',
        button: 'Mac माइक टेस्ट शुरू करें'
      }
    },
    teams: {
      en: {
        title: 'Microsoft Teams & Zoom Mic Test | Check Mic Before Calls',
        description: 'Check your microphone before Microsoft Teams and Zoom calls. Hear yourself with zero-latency loopback and test vocal clarity before meeting clients.',
        badge: 'Microsoft Teams & Zoom • 100% Local',
        heading: '<h1>Test your microphone for <span>Teams & Zoom</span></h1>',
        heroDescription: 'Check your microphone before Microsoft Teams, Zoom, and Google Meet calls. Hear yourself with live loopback monitoring to ensure crisp vocal clarity.',
        button: 'Start Teams & Zoom test'
      },
      hi: {
        title: 'Teams और Zoom के लिए माइक टेस्ट करें | Check Mic Before Calls',
        description: 'Microsoft Teams, Zoom और Google Meet मीटिंग से पहले माइक चेक करें। बिना देरी लाइव आवाज़ सुनें और बातचीत में रुकावट से बचें।',
        badge: 'Teams और Zoom • 100% सुरक्षित व लोकल',
        heading: '<h1><span>Teams और Zoom</span> के लिए माइक टेस्ट करें</h1>',
        heroDescription: 'Microsoft Teams, Zoom और Google Meet कॉल से पहले अपना माइक टेस्ट करें। लाइव आवाज़ सुनकर स्पष्टता पक्की करें।',
        button: 'Teams & Zoom माइक टेस्ट शुरू करें'
      }
    },
    airpods: {
      en: {
        title: 'AirPods & Bluetooth Mic Test | Check Wireless Headset',
        description: 'Test AirPods and Bluetooth headset microphones with live volume levels, frequency detection, and instant playback to verify microphone clarity.',
        badge: 'AirPods & Bluetooth • 100% Local',
        heading: '<h1>Test your microphone on <span>AirPods</span></h1>',
        heroDescription: 'Test AirPods, earbuds, and Bluetooth headset microphones in your browser. Verify audio clarity, detect pitch, and test playback before meetings and calls.',
        button: 'Start AirPods mic test'
      },
      hi: {
        title: 'AirPods और Bluetooth माइक टेस्ट करें | Check Wireless Headset',
        description: 'AirPods और ब्लूटूथ हेडसेट माइक की लाइव टेस्टिंग करें। आवाज़ की स्पष्टता और प्लेबैक सुनकर कॉल के लिए तैयार रहें।',
        badge: 'AirPods और Bluetooth • 100% सुरक्षित व लोकल',
        heading: '<h1><span>AirPods और Bluetooth</span> माइक टेस्ट करें</h1>',
        heroDescription: 'AirPods और वायरलेस ब्लूटूथ हेडसेट का माइक टेस्ट करें। पिच, लाइव वॉल्यूम लेवल और लोकल रिकॉर्डिंग से आवाज़ परखें।',
        button: 'AirPods माइक टेस्ट शुरू करें'
      }
    }
  };

  if (pageType !== 'home') {
    const devNames = {
      windows: 'Windows 10 & 11',
      mac: 'Mac & Safari',
      teams: 'Teams & Zoom',
      airpods: 'AirPods & Bluetooth'
    };
    const devLabel = devNames[pageType] || pageType;
    const custom = subpageConfigs[pageType]?.[code];
    if (custom) {
      pageTitle = custom.title;
      pageDescription = custom.description;
      heroBadge = custom.badge;
      heroHeading = custom.heading;
      heroDescription = custom.heroDescription;
      startBtnLabel = custom.button;
    } else {
      pageTitle = `${ui.yourMicrophone || 'Microphone Test'} - ${devLabel} | TestYourMicrophone`;
      pageDescription = `${ui.yourMicrophone || 'Microphone test'} for ${devLabel}. ${content.heroDescription}`;
      heroBadge = `${devLabel} • ${content.privacyBadge || '100% Local'}`;
      heroHeading = `<h1>${ui.yourMicrophone || 'Test microphone'} <span>${devLabel}</span></h1>`;
      heroDescription = content.heroDescription;
      startBtnLabel = `${ui.startTest || 'Start test'} (${devLabel})`;
    }
  }

  // JSON-LD Schemas
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": `${schemas.webAppName}${pageType !== 'home' ? ` - ${pageType.charAt(0).toUpperCase() + pageType.slice(1)}` : ''}`,
    "url": pageUrl,
    "description": pageDescription,
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires a modern browser with microphone access",
    "isAccessibleForFree": true,
    "inLanguage": code
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a
      }
    }))
  };

  const breadcrumbElements = [
    {
      "@type": "ListItem",
      "position": 1,
      "name": name,
      "item": path ? `${SITE_URL}/${path}/` : `${SITE_URL}/`
    }
  ];
  if (pageType !== 'home') {
    breadcrumbElements.push({
      "@type": "ListItem",
      "position": 2,
      "name": pageType.charAt(0).toUpperCase() + pageType.slice(1),
      "item": pageUrl
    });
  }
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbElements
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": schemas.howToName,
    "description": schemas.howToDescription,
    "totalTime": "PT1M",
    "inLanguage": code,
    "step": schemas.howToSteps.map(step => ({
      "@type": "HowToStep",
      "position": step.position,
      "name": step.name,
      "text": step.text,
      "url": `${pageUrl}#tester`
    }))
  };

  // Language Dropdown HTML (pure crawlable links for SEO)
  const languageOptionsHtml = languageList.map((lang) => {
    const targetUrl = lang.path
      ? (pageFile ? `/${lang.path}/${pageFile}` : `/${lang.path}/`)
      : (pageFile ? `/${pageFile}` : `/`);
    const isActive = lang.code === code ? ' is-active' : '';
    const ariaCurrent = lang.code === code ? ' aria-current="page"' : '';
    const enLabel = lang.englishName && lang.englishName !== lang.name
      ? `<span class="lang-name-en">${lang.englishName}</span>`
      : '';
    return `<a href="${targetUrl}" class="lang-option${isActive}" hreflang="${lang.code}" lang="${lang.code}"${ariaCurrent} role="menuitem"><span class="lang-name-native">${lang.name}</span>${enLabel}</a>`;
  }).join('\n                ');

  // Footer languages grid
  const footerLanguagesHtml = languageList.map((lang) => {
    const targetUrl = lang.path
      ? (pageFile ? `/${lang.path}/${pageFile}` : `/${lang.path}/`)
      : (pageFile ? `/${pageFile}` : `/`);
    const isCurrent = lang.code === code ? ' class="current-lang"' : '';
    return `<a href="${targetUrl}" hreflang="${lang.code}" lang="${lang.code}"${isCurrent}>${lang.name}</a>`;
  }).join('\n            ');

  // Feature cards HTML
  const featuresHtml = content.features.map((feat, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const highlight = idx === 0 ? ' feature-card-highlight' : '';
    return `          <article class="feature-card${highlight}" data-reveal-child>
            <div class="feature-icon" aria-hidden="true">${idx === 0 ? '<span></span><span></span><span></span><span></span><span></span>' : idx === 1 ? '⌁' : idx === 2 ? '🎧' : idx === 3 ? '<i></i><i></i><i></i><i></i>' : idx === 4 ? '✓' : '◇'}</div>
            <h3>${feat.title}</h3>
            <p>${feat.desc}</p><span class="feature-number">${num}</span>
          </article>`;
  }).join('\n');

  // Steps HTML
  const stepsHtml = content.steps.map((st, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return `          <li><span class="step-number">${num}</span>
            <div>
              <h3>${st.title}</h3>
              <p>${st.desc}</p>
            </div>
          </li>`;
  }).join('\n');

  // FAQs HTML
  const faqsHtml = faqs.map((f, idx) => {
    const openAttr = idx === 0 ? ' open' : '';
    return `          <details${openAttr}>
            <summary><span>${f.q}</span><span class="summary-icon">+</span></summary>
            <p>${f.a}</p>
          </details>`;
  }).join('\n');

  const homeTarget = path ? `/${path}/` : `/`;
  const windowsTarget = path ? `/${path}/windows-mic-test.html` : `/windows-mic-test.html`;
  const macTarget = path ? `/${path}/mac-mic-test.html` : `/mac-mic-test.html`;
  const teamsTarget = path ? `/${path}/teams-mic-test.html` : `/teams-mic-test.html`;
  const airpodsTarget = path ? `/${path}/airpods-mic-test.html` : `/airpods-mic-test.html`;

  const selectedMicLabel = content.selectedMicLabel || ui.yourMicrophone || 'Your microphone';
  const backToHome = content.backToHome || ui.back || (code === 'hi' ? 'वापस' : code === 'de' ? 'Zurück' : code === 'fr' ? 'Retour' : code === 'es' ? 'Volver' : code === 'ar' ? 'رجوع' : 'Back');
  const testerKicker = content.testerKicker || (code === 'hi' ? 'लाइव इनपुट मॉनिटर' : code === 'de' ? 'Live-Eingangsmonitor' : code === 'fr' ? 'Moniteur d\'entrée en direct' : code === 'es' ? 'Monitor de entrada en vivo' : 'Live input monitor');
  const testerTitle = content.testerTitle || ui.yourMicrophone || 'Your microphone';
  const featuresKicker = content.featuresKicker || content.featuresLabel || 'Features';
  const featuresHeading = content.featuresHeading || content.featuresTitle || 'Everything you need to check your microphone.';
  const featuresLead = content.featuresLead || content.featuresDescription || '';
  const howKicker = content.howKicker || content.howLabel || 'How to test your microphone';
  const howHeading = content.howHeading || content.howTitle || 'Five seconds to a useful answer.';
  const howLead = content.howLead || content.howDesc || '';
  const faqKicker = content.faqKicker || content.faqLabel || 'Microphone FAQs';
  const faqHeading = content.faqHeading || content.faqTitle || 'How do I test my microphone?';
  const faqLead = content.faqLead || content.faqIntro || '';
  const privacyBannerHeading = content.privacyBannerHeading || content.privacyTitle || 'Your microphone stream stays on this page.';
  const privacyBannerText = content.privacyBannerText || content.privacyDesc || '';
  const privacyBannerButton = content.privacyBannerButton || content.privacyButton || ui.startTest || 'Test privately';
  const navFaqLabel = (content.faqLabel && content.faqLabel.length <= 15) ? content.faqLabel : 'FAQ';

  return `<!doctype html>
<html lang="${code}" dir="${dir}">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDescription}" />
  <meta name="theme-color" content="#111111" data-theme-color />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${pageUrl}" />
${hreflangs}
  <script>
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      location.replace('https://' + location.hostname.replace(/^www\\./i, '') + location.pathname + location.search + location.hash);
    }
  </script>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="TestYourMicrophone.com" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${pageDescription}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="https://testyourmicrophone.com/assets/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${pageDescription}" />
  <meta name="twitter:image" content="https://testyourmicrophone.com/assets/og-image.png" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="preconnect" href="https://www.googletagmanager.com" crossorigin />
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-5L01FMWM1L');
    (function () {
      var loadAnalytics = function () {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-5L01FMWM1L';
        document.head.appendChild(script);
      };
      if ('requestIdleCallback' in window) requestIdleCallback(loadAnalytics, { timeout: 3000 });
      else setTimeout(loadAnalytics, 2000);
    })();
  </script>
  <script>
    (() => {
      try {
        const saved = localStorage.getItem("tym-theme");
        const theme = saved === "light" || saved === "dark"
          ? saved
          : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
        document.documentElement.classList.add("js");
        document.documentElement.dataset.theme = theme;
        document.body?.setAttribute("data-theme", theme);
        document.querySelector("[data-theme-color]")?.setAttribute("content", theme === "light" ? "#f7f8fa" : "#111111");
      } catch { }
    })();
  </script>
  <script type="application/ld+json">
${JSON.stringify(webAppSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(howToSchema, null, 2)}
  </script>
</head>

<body data-view="home">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${homeTarget}" data-brand-link aria-label="TestYourMicrophone.com home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>Test<span class="brand-accent">Your</span>Microphone</span>
      </a>
      <nav class="main-nav" aria-label="Primary navigation">
        <a${pageType === 'home' ? ' class="active" aria-current="page"' : ''} href="${homeTarget}" data-home-link>${ui.yourMicrophone || 'Your microphone'}</a>
        <a${pageType === 'windows' ? ' class="active" aria-current="page"' : ''} href="${windowsTarget}">Windows</a>
        <a${pageType === 'mac' ? ' class="active" aria-current="page"' : ''} href="${macTarget}">Mac</a>
        <a${pageType === 'teams' ? ' class="active" aria-current="page"' : ''} href="${teamsTarget}">Teams & Zoom</a>
        <a${pageType === 'airpods' ? ' class="active" aria-current="page"' : ''} href="${airpodsTarget}">AirPods</a>
        <a href="#features">${content.featuresLabel}</a>
        <a href="#troubleshooting">${navFaqLabel}</a>
      </nav>
      <div class="header-actions">
        <div class="lang-selector" id="lang-selector">
          <button class="lang-btn" id="lang-btn" type="button" aria-expanded="false" aria-controls="lang-dropdown" aria-label="Choose language: ${name}">
            <span class="lang-icon" aria-hidden="true">🌐</span>
            <span class="lang-current-label">${name}</span>
            <span class="lang-arrow" aria-hidden="true">▾</span>
          </button>
          <div class="lang-dropdown" id="lang-dropdown" role="menu" hidden>
            <div class="lang-dropdown-top">
              <div class="lang-dropdown-header">
                <span class="lang-dropdown-title">Choose Language</span>
              </div>
              <div class="lang-search-wrap">
                <input type="search" class="lang-search-input" id="lang-search-input" placeholder="Search language..." aria-label="Search language" autocomplete="off" />
              </div>
            </div>
            <div class="lang-dropdown-grid">
              ${languageOptionsHtml}
            </div>
          </div>
        </div>
        <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Theme: dark. Switch to light theme"
          aria-pressed="false"><span class="theme-toggle-icon" aria-hidden="true">☾</span><span
            class="theme-toggle-text">Dark</span></button>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation menu">Menu</button>
      </div>
    </div>
    <nav class="mobile-nav container" id="mobile-nav" aria-label="Mobile navigation">
      <a href="${homeTarget}" data-home-link>${ui.yourMicrophone || 'Your microphone'}</a>
      <a href="${windowsTarget}">Windows Mic Test</a>
      <a href="${macTarget}">Mac Mic Test</a>
      <a href="${teamsTarget}">Teams & Zoom Mic Test</a>
      <a href="${airpodsTarget}">AirPods Mic Test</a>
      <a href="#features">${content.featuresLabel}</a>
      <a href="#how-it-works">${content.howLabel}</a>
      <a href="#troubleshooting">${content.faqLabel}</a>
      <div class="mobile-lang-list">
        <p class="mobile-lang-title">🌐 ${content.footerLanguagesTitle}:</p>
        <div class="mobile-lang-grid">
          ${languageOptionsHtml}
        </div>
      </div>
    </nav>
  </header>

  <main id="main-content">
    <section class="hero-section" id="tester" data-home-view>
      <div class="container hero-layout">
        <div class="hero-copy">
          <div class="privacy-badge"><span class="privacy-badge-icon" aria-hidden="true">✓</span> ${heroBadge}</div>
          ${heroHeading}
          <p class="hero-description">${heroDescription}</p>
          <div class="hero-actions">
            <button class="primary-button" id="start-test" type="button"><span class="button-icon" aria-hidden="true">🎤</span><span id="start-test-label">${startBtnLabel}</span></button>
          </div>
          <div class="hero-device-row">
            <label for="home-device-select">${ui.chooseMicrophone}</label>
            <div class="hero-device-controls">
              <select id="home-device-select" disabled>
                <option value="">${ui.allowAccessToList}</option>
              </select>
              <button class="secondary-button" id="load-devices" type="button"><span class="btn-glyph" aria-hidden="true">↻</span><span id="load-devices-label">${ui.showMicrophones}</span></button>
            </div>
            <p class="hero-device-hint" id="home-device-hint">${ui.namesRevealedHint}</p>
          </div>
          <div class="hero-mic-status" aria-live="polite">
            <div class="hero-mic-label"><span class="mic-status-icon" aria-hidden="true">♩</span><span>${selectedMicLabel}</span></div>
            <dl class="hero-mic-details">
              <div><dt>${ui.status}</dt><dd id="detected-device">${ui.notStarted}</dd></div>
              <div><dt>${ui.lastTested}</dt><dd><time id="last-tested">${ui.notYet}</time></dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="test-section" id="live-test" data-test-view hidden aria-labelledby="tester-card-title" tabindex="-1">
      <div class="container test-layout">
        <button class="back-button" id="back-to-home" type="button"><span aria-hidden="true">←</span> ${backToHome}</button>
        <div class="tester-card">
          <div class="tester-card-topline">
            <div>
              <p class="card-kicker">${testerKicker}</p>
              <h2 id="tester-card-title">${testerTitle}</h2>
            </div>
            <div class="permission-state" id="permission-state" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="permission-label">${ui.ready}</span></div>
          </div>
          <div class="device-row">
            <label for="device-select">${ui.chooseMicrophone}</label>
            <select id="device-select" aria-label="${ui.chooseMicrophone}">
              <option value="">${ui.allowAccessToList}</option>
            </select>
          </div>
          <div class="meter-shell" id="meter-shell">
            <div class="meter-header">
              <span id="signal-label">${ui.listeningForSignal}</span>
              <span class="meter-value" id="level-value">0%</span>
            </div>
            <div class="waveform" id="waveform" aria-label="${ui.currentLevel}" role="img">
              <span></span><span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="meter-footer">
              <span class="meter-scale-label">0</span>
              <div class="meter-scale" aria-hidden="true">
                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </div>
              <span class="meter-scale-label">100</span>
            </div>
          </div>
          <div class="metrics-grid">
            <div class="metric-card"><span class="metric-label">${ui.currentLevel}</span><strong id="current-level">0%</strong></div>
            <div class="metric-card"><span class="metric-label">${ui.peakLevel}</span><strong id="peak-level">0%</strong></div>
            <div class="metric-card"><span class="metric-label">${ui.decibels}</span><strong id="dbfs-level">${ui.silentDbfs}</strong></div>
            <div class="metric-card"><span class="metric-label">${ui.pitchNote}</span><strong id="frequency-value">—</strong></div>
            <div class="metric-card"><span class="metric-label">${ui.sampleRate}</span><strong id="sample-rate">—</strong></div>
            <div class="metric-card"><span class="metric-label">${ui.channels}</span><strong id="channel-count">—</strong></div>
          </div>
          <div class="tester-feedback" aria-live="polite">
            <div class="feedback-badge" id="live-device-badge"><span class="feedback-dot" aria-hidden="true"></span><span id="live-device-name">${ui.notStarted}</span></div>
            <button class="loopback-button" id="loopback-button" type="button" aria-pressed="false" disabled><span class="loopback-icon" aria-hidden="true">🎧</span><span id="loopback-label">${ui.hearMyselfOff}</span></button>
            <p class="headphone-tip">${ui.headphoneHint}</p>
          </div>
          <div class="record-controls">
            <button class="record-button" id="record-button" type="button" disabled><span class="record-dot" aria-hidden="true"></span><span id="record-button-label">${ui.recordClip}</span></button>
            <div class="recording-meta">
              <span id="recording-status">${ui.startTestBeforeRecording}</span>
              <span class="recording-duration" id="recording-duration">0 sec</span>
            </div>
          </div>
          <div class="audio-preview-wrap is-empty" id="audio-preview-wrap">
            <label for="audio-preview">${ui.latestRecording}</label>
            <audio id="audio-preview" controls></audio>
            <a class="download-link is-disabled" id="download-recording" href="#" download="microphone-test.webm" aria-disabled="true">${ui.downloadClip}</a>
          </div>
          <div class="tester-error" id="tester-error" role="alert" hidden></div>
          <p class="privacy-lock-note"><span aria-hidden="true">🔒</span> ${ui.localPrivacyLock}</p>
        </div>
      </div>
    </section>

    <section class="section section-border" id="features" data-reveal>
      <div class="container">
        <div class="section-header">
          <p class="section-kicker">${featuresKicker}</p>
          <h2>${featuresHeading}</h2>
          <p class="section-lead">${featuresLead}</p>
        </div>
        <div class="feature-grid">
${featuresHtml}
        </div>
      </div>
    </section>

    <section class="section how-section" id="how-it-works" data-reveal>
      <div class="container how-layout">
        <div class="how-intro">
          <p class="section-kicker">${howKicker}</p>
          <h2>${howHeading}</h2>
          <p>${howLead}</p>
        </div>
        <ol class="steps-list">
${stepsHtml}
        </ol>
      </div>
    </section>

    <section class="section troubleshooting-section section-border" id="troubleshooting" data-reveal>
      <div class="container troubleshooting-layout">
        <div class="troubleshooting-intro">
          <p class="section-kicker">${faqKicker}</p>
          <h2>${faqHeading}</h2>
          <p>${faqLead}</p>
        </div>
        <div class="faq-list">
${faqsHtml}
        </div>
      </div>
    </section>

    <section class="privacy-section" data-reveal>
      <div class="container privacy-panel">
        <div>
          <h2>${privacyBannerHeading}</h2>
          <p>${privacyBannerText}</p>
        </div>
        <a class="outline-button" href="#tester">${privacyBannerButton} <span class="button-arrow"
            aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>

  <footer class="site-footer" id="feedback" data-reveal>
    <div class="container footer-main">
      <div class="footer-brand"><a class="brand" href="${homeTarget}" aria-label="TestYourMicrophone.com home"><span
            class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span>Test<span
              class="brand-accent">Your</span>Microphone</span></a>
        <p>${content.footerSlogan}</p>
      </div>
      <div class="footer-links">
        <div>
          <h3>${content.footerToolsTitle}</h3>
          <a href="#tester">${ui.startTest}</a>
          <a href="#tester">${ui.currentLevel}</a>
          <a href="#tester">${ui.recordClip}</a>
        </div>
        <div>
          <h3>${content.footerHelpTitle}</h3>
          <a href="#how-it-works">${content.howLabel}</a>
          <a href="#troubleshooting">${content.faqLabel}</a>
          <a href="${windowsTarget}">Windows Mic Test</a>
          <a href="${macTarget}">Mac Mic Test</a>
          <a href="${teamsTarget}">Teams & Zoom Mic Test</a>
          <a href="${airpodsTarget}">AirPods Mic Test</a>
        </div>
        <div>
          <h3>${content.footerAboutTitle}</h3>
          <a href="mailto:hello@testyourmicrophone.com?subject=Feedback">Contact</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
        </div>
      </div>
    </div>
    <div class="container footer-languages-section">
      <div class="footer-languages-header">
        <h3 class="footer-languages-heading">🌐 ${content.footerLanguagesTitle}</h3>
      </div>
      <div class="footer-languages-grid">
        ${footerLanguagesHtml}
      </div>
    </div>
    <div class="container footer-bottom">
      <span>${content.footerRights}</span>
      <span>${content.footerSlogan}</span>
      <span>${content.footerNote}</span>
    </div>
  </footer>
  <script>
    window.__TYM_I18N__ = ${JSON.stringify(ui)};
  </script>
  <script src="/app.js" defer></script>
</body>

</html>
`;
}

export async function buildAllLanguages() {
  console.log(`\n[Building Multilingual Static Distribution for 32 Languages]`);

  // 1. Build sitemap.xml
  const sitemapXml = buildSitemapXml();
  await writeFile(resolve(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
  await writeFile(resolve(projectRoot, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log(`✔ Generated sitemap.xml with 162 URLs and reciprocal xhtml:link annotations.`);

  const pageTypes = [
    { type: 'home', file: 'index.html' },
    { type: 'windows', file: 'windows-mic-test.html' },
    { type: 'mac', file: 'mac-mic-test.html' },
    { type: 'teams', file: 'teams-mic-test.html' },
    { type: 'airpods', file: 'airpods-mic-test.html' }
  ];

  // 2. Build each language's static pages
  for (const lang of languageList) {
    const locale = allLocales[lang.code];
    if (!locale) {
      console.warn(`Locale ${lang.code} missing from dictionary`);
      continue;
    }

    for (const p of pageTypes) {
      const html = generatePageHtml(locale, p.type);
      if (!lang.path) {
        // Root / English
        await writeFile(resolve(distDir, p.file), html, 'utf8');
        await writeFile(resolve(projectRoot, p.file), html, 'utf8');
      } else {
        // Localized subdirectories: dist/{path}/{file}
        const langDistDir = resolve(distDir, lang.path);
        await mkdir(langDistDir, { recursive: true });
        await writeFile(resolve(langDistDir, p.file), html, 'utf8');
      }
    }
    console.log(`✔ Generated dist/${lang.path ? lang.path + '/' : ''} [5 pages] (${lang.name})`);
  }

  console.log(`\n🎉 All 160 language pages generated successfully!`);
}

// Run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildAllLanguages();
}
