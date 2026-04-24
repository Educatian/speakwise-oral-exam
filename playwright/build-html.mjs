// Convert guidebook markdown → standalone styled HTML.
// Output: docs/guidebooks/html/{instructor,student}_{ko,en}.html
// Run: node playwright/build-html.mjs

import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs', 'guidebooks');
const OUT_DIR = path.join(DOCS_DIR, 'html');
mkdirSync(OUT_DIR, { recursive: true });

// ── Shared CSS ──────────────────────────────────────────────────────────────
const CSS = `
:root {
  --paper: #fbfaf6;
  --ink: #181515;
  --ink-mute: #6b6260;
  --ink-faint: #9a9290;
  --rule: #e3dfd6;
  --accent: #8a4b1c;
  --accent-soft: #f3ead6;
  --code-bg: #f1ecdf;
  --shadow: 0 4px 18px -6px rgba(20, 18, 16, 0.12);
  --max-body: 720px;
}
* { box-sizing: border-box; }
html { -webkit-font-smoothing: antialiased; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Charter', 'Georgia', 'Noto Serif KR', serif;
  font-size: 17px;
  line-height: 1.7;
  font-feature-settings: 'kern' 1, 'liga' 1;
}
.app {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 48px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 32px 120px;
}
@media (max-width: 920px) {
  .app { grid-template-columns: 1fr; gap: 16px; }
}

/* TOC sidebar */
.toc {
  position: sticky;
  top: 32px;
  align-self: start;
  font-family: 'Inter', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: var(--ink-mute);
  border-right: 1px solid var(--rule);
  padding-right: 20px;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}
.toc .brand {
  font-family: 'Charter', 'Georgia', serif;
  font-style: italic;
  font-size: 22px;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin-bottom: 4px;
}
.toc .sub {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 14px;
}
.toc .switcher {
  display: flex;
  gap: 6px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
}
.toc .switcher a {
  color: var(--ink-mute);
  text-decoration: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: border-color 150ms ease, color 150ms ease;
}
.toc .switcher a:hover { border-color: var(--accent); color: var(--accent); }
.toc .switcher a.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.toc ul {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.toc li { margin: 2px 0; }
.toc a {
  color: var(--ink-mute);
  text-decoration: none;
  display: block;
  padding: 4px 8px;
  border-radius: 6px;
  border-left: 2px solid transparent;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  line-height: 1.4;
}
.toc a:hover { background: var(--accent-soft); color: var(--accent); }
.toc a.level-3 { padding-left: 20px; font-size: 12px; }
.toc a.active { border-left-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

/* Main content */
main {
  max-width: var(--max-body);
}
h1, h2, h3, h4 {
  font-family: 'Inter', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--ink);
  letter-spacing: -0.012em;
  line-height: 1.25;
  font-weight: 600;
  margin-top: 2em;
  margin-bottom: 0.6em;
}
h1 {
  font-size: 2.4rem;
  margin-top: 0;
  margin-bottom: 0.2em;
  font-weight: 700;
  letter-spacing: -0.02em;
}
h1 + blockquote {
  margin-top: 0;
  font-family: 'Charter', 'Georgia', serif;
  font-style: italic;
  font-size: 0.95rem;
  color: var(--ink-mute);
  background: transparent;
  border-left: 3px solid var(--accent);
  padding: 4px 16px;
}
h2 {
  font-size: 1.55rem;
  border-top: 1px solid var(--rule);
  padding-top: 2.2em;
}
h2:first-of-type { border-top: 0; padding-top: 0; }
h3 { font-size: 1.15rem; }
h4 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-mute); }

p, li { color: var(--ink); }
p { margin: 0 0 1em; }
ul, ol { padding-left: 1.5em; }
li { margin: 0.35em 0; }
a { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }

blockquote {
  margin: 1.4em 0;
  padding: 16px 20px;
  background: var(--accent-soft);
  border-left: 3px solid var(--accent);
  color: var(--ink);
  font-size: 0.95em;
  border-radius: 0 8px 8px 0;
}
blockquote p:last-child { margin-bottom: 0; }

code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: var(--code-bg);
  color: var(--ink);
  font-size: 0.88em;
  padding: 1px 6px;
  border-radius: 4px;
}
pre {
  background: var(--code-bg);
  padding: 14px 18px;
  border-radius: 10px;
  overflow-x: auto;
  line-height: 1.5;
  font-size: 0.88em;
  border: 1px solid var(--rule);
}
pre code { background: transparent; padding: 0; border-radius: 0; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.93em;
}
th, td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}
th {
  font-family: 'Inter', 'Noto Sans KR', sans-serif;
  font-weight: 600;
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-mute);
}

hr {
  border: 0;
  height: 1px;
  background: var(--rule);
  margin: 2.5em 0;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: 10px;
  border: 1px solid var(--rule);
  box-shadow: var(--shadow);
  margin: 1.2em 0;
}
img + em {
  display: block;
  text-align: center;
  font-size: 0.85em;
  color: var(--ink-mute);
  margin-top: -0.6em;
  margin-bottom: 2em;
}

/* Footer line */
main > p > em:only-child {
  display: block;
  border-top: 1px solid var(--rule);
  padding-top: 20px;
  color: var(--ink-faint);
  font-size: 0.85em;
  margin-top: 4em;
}

/* Print */
@media print {
  .toc { display: none; }
  .app { grid-template-columns: 1fr; padding: 0; max-width: none; }
  main { max-width: none; }
  img { box-shadow: none; border-radius: 4px; page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
  pre, blockquote { page-break-inside: avoid; }
  @page { margin: 0.6in; }
}
`;

// ── Marked setup ────────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: false });

// Extract an id-friendly slug for heading anchors.
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64) || 'section';
}

function buildToc(markdown) {
  const lines = markdown.split('\n');
  const items = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length;
    const label = m[2].replace(/^[\d.]+\s*/, '').replace(/[`*]/g, '');
    items.push({ level, label, id: slugify(label) });
  }
  return items;
}

// marked v16+ renderer API: each method receives a token object, not positional
// args. Return a string of HTML.
const renderer = {
  heading(token) {
    const inner = this.parser.parseInline(token.tokens);
    const clean = inner.replace(/<[^>]+>/g, '').replace(/[`*]/g, '').replace(/^[\d.]+\s*/, '');
    const id = slugify(clean);
    return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
  },
  image(token) {
    const src = token.href?.startsWith('screenshots/') ? `../${token.href}` : token.href;
    const t = token.title ? ` title="${token.title}"` : '';
    return `<img src="${src}" alt="${token.text ?? ''}"${t} loading="lazy">`;
  }
};

// ── Language-switcher data ──────────────────────────────────────────────────
const DOCS = {
  instructor_ko: {
    file: 'instructor.md',
    title: 'SpeakWise 강사 가이드북',
    subtitle: 'INSTRUCTOR · KOREAN',
    lang: 'ko',
    audience: 'instructor'
  },
  instructor_en: {
    file: 'instructor_en.md',
    title: 'SpeakWise Instructor Guide',
    subtitle: 'INSTRUCTOR · ENGLISH',
    lang: 'en',
    audience: 'instructor'
  },
  student_ko: {
    file: 'student.md',
    title: 'SpeakWise 학생 가이드북',
    subtitle: 'STUDENT · KOREAN',
    lang: 'ko',
    audience: 'student'
  },
  student_en: {
    file: 'student_en.md',
    title: 'SpeakWise Student Guide',
    subtitle: 'STUDENT · ENGLISH',
    lang: 'en',
    audience: 'student'
  }
};

const SWITCH_LABELS = {
  instructor_ko: '강사 (KO)',
  instructor_en: 'Instructor (EN)',
  student_ko: '학생 (KO)',
  student_en: 'Student (EN)'
};

function renderSwitcher(currentKey) {
  const order = ['instructor_ko', 'instructor_en', 'student_ko', 'student_en'];
  return order.map((k) => {
    const isActive = k === currentKey;
    const href = `./${k}.html`;
    return `<a href="${href}" class="${isActive ? 'active' : ''}">${SWITCH_LABELS[k]}</a>`;
  }).join('');
}

function renderTocList(toc) {
  const items = toc.map((item) => {
    const cls = `level-${item.level}`;
    return `<li><a class="${cls}" href="#${item.id}">${item.label}</a></li>`;
  }).join('\n');
  return `<ul>\n${items}\n</ul>`;
}

function renderPage(key, meta) {
  const mdPath = path.join(DOCS_DIR, meta.file);
  const md = readFileSync(mdPath, 'utf8');
  const toc = buildToc(md);
  // Apply custom renderer by using `use` + re-parse for each doc. marked is
  // singleton but use() only adds; calling here is fine since renderer is
  // stateless.
  marked.use({ renderer });
  const body = marked.parse(md);

  const html = `<!DOCTYPE html>
<html lang="${meta.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${meta.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <aside class="toc">
    <div class="brand">speakwise</div>
    <div class="sub">${meta.subtitle}</div>
    <nav class="switcher" aria-label="Guide switcher">${renderSwitcher(key)}</nav>
    <nav aria-label="Table of contents">
      ${renderTocList(toc)}
    </nav>
  </aside>
  <main>
    ${body}
  </main>
</div>
<script>
// Highlight the TOC entry for the section currently in view.
(function () {
  const links = document.querySelectorAll('.toc a[href^="#"]');
  const targets = Array.from(links).map((a) => {
    const id = a.getAttribute('href').slice(1);
    return { link: a, el: document.getElementById(id) };
  }).filter((x) => x.el);
  if (targets.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      links.forEach((l) => l.classList.remove('active'));
      const link = document.querySelector('.toc a[href="#' + id + '"]');
      if (link) link.classList.add('active');
    });
  }, { rootMargin: '-20% 0% -70% 0%' });
  targets.forEach((t) => observer.observe(t.el));
})();
</script>
</body>
</html>`;

  const outPath = path.join(OUT_DIR, `${key}.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`  ✓ html/${key}.html`);
}

function main() {
  console.log('Building HTML guidebooks');
  for (const [key, meta] of Object.entries(DOCS)) {
    renderPage(key, meta);
  }

  // Build a simple index.html that redirects to instructor_ko.
  const indexHtml = `<!DOCTYPE html><meta charset="UTF-8"><title>SpeakWise Guidebooks</title>
<meta http-equiv="refresh" content="0; url=instructor_ko.html">
<p>Redirecting to <a href="instructor_ko.html">instructor_ko.html</a>.</p>`;
  writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml);
  console.log('  ✓ html/index.html');

  console.log('\nDone.');
}

main();
