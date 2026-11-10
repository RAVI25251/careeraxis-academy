#!/usr/bin/env node
/**
 * CareerAxis Academy - static SEO generator.
 *
 * Reads PUBLISHED jobs from Supabase (public anon key; row-level security
 * already limits it to published rows) and writes:
 *
 *   jobs/index.html          crawlable list of open jobs
 *   jobs/<slug>/index.html   one indexable page per job
 *                            (JobPosting structured data only when the job
 *                            is open and has a real description)
 *   sitemap.xml              home, jobs list, legal pages, every OPEN job page
 *   index.html               refreshes only the SEO:START ... SEO:END block
 *
 * Usage:
 *   node scripts/generate-seo.mjs                    read Supabase
 *   node scripts/generate-seo.mjs --input jobs.json  offline / testing
 *
 * If Supabase cannot be read the script exits with an error and writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = (process.env.SITE_URL || 'https://careeraxisacademy.in').replace(/\/$/, '');
const MARK = '<!--careeraxis-generated-->';

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const todayIST = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const isoDay = (v) => { const x = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ''; };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const httpUrl = (u) => { try { const x = new URL(String(u || '')); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
const prettyDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

function readConfig() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    try {
      const cfg = fs.readFileSync(path.join(ROOT, 'site-config.js'), 'utf8');
      url = url || (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
      key = key || (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
    } catch { /* ignore */ }
  }
  return { url, key };
}

async function loadJobs() {
  const i = process.argv.indexOf('--input');
  if (i > -1) return JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  const { url, key } = readConfig();
  if (!url || !key) throw new Error('Supabase URL / anon key not found (set SUPABASE_URL and SUPABASE_ANON_KEY, or fix site-config.js).');
  const cols = 'id,slug,title,company,category,location,qualification,description,last_date,apply_url,source_url,status,featured,created_at,updated_at';
  const res = await fetch(`${url}/rest/v1/jobs?select=${cols}&published=eq.true&order=created_at.desc&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected Supabase response.');
  return rows;
}

function normalise(rows) {
  const used = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || !r.title || !r.company) continue;
    let slug = slugify(r.slug) || `${slugify(`${r.title}-${r.company}`)}-${String(r.id || '').replace(/-/g, '').slice(0, 6)}`;
    if (!slug || slug === '-') continue;
    if (used.has(slug)) slug = `${slug}-${String(r.id || out.length).replace(/-/g, '').slice(0, 4)}`;
    used.add(slug);
    const deadline = isoDay(r.last_date);
    const closed = r.status === 'archived' || (deadline && daysBetween(todayIST(), deadline) < 0);
    out.push({ ...r, slug, deadline, closed: !!closed, apply: httpUrl(r.apply_url) || httpUrl(r.source_url) });
  }
  return out;
}

/* ---------- page templates ---------- */
const header = `
<a class="skip-link" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/" aria-label="CareerAxis Academy home">
    <span class="logo-wrap"><img src="/assets/careeraxis-logo.png" alt="CareerAxis Academy"></span>
    <span><b>CAREERAXIS</b><small>ACADEMY · KNOWLEDGE TO SUCCESS</small></span>
  </a>
  <div class="static-links"><a href="/">Home</a><a href="/jobs/">Jobs</a><a href="/#resources">Resources</a></div>
</header>`;

const footer = `
<footer>
  <div><strong>CareerAxis Academy</strong><p>Free career, jobs, education and preparation information.</p></div>
  <div><b>Quick Links</b><a href="/jobs/">Jobs</a><a href="/#resources">Resources</a><a href="/#youtube">YouTube</a></div>
  <div><b>Legal</b><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
  <div><b>Contact</b><a href="mailto:careeraxisacademy@gmail.com">careeraxisacademy@gmail.com</a></div>
</footer>`;

function page({ title, description, canonical, robots = 'index,follow,max-image-preview:large', body, ld = [] }) {
  return `<!doctype html>
${MARK}
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/assets/careeraxis-logo.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CareerAxis Academy">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/assets/careeraxis-logo.png">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/styles.css">
${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
</head>
<body>
${header}
<main id="main" class="section">
${body}
</main>
${footer}
</body>
</html>
`;
}

function jobPage(j) {
  const url = `${SITE}/jobs/${j.slug}/`;
  const where = j.location || 'India';
  const title = `${j.title} – ${j.company} | CareerAxis Academy`;
  const desc = clip(
    `${j.title} at ${j.company}, ${where}.` +
      (j.qualification ? ` Eligibility: ${j.qualification}.` : '') +
      (j.deadline ? ` Last date: ${prettyDate(j.deadline)}.` : '') +
      ' Official application link and details.',
    155,
  );
  const ld = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: `${SITE}/jobs/` },
      { '@type': 'ListItem', position: 3, name: j.title, item: url },
    ],
  }];
  const text = String(j.description || '').trim();
  /* JobPosting only for open jobs that carry a real description. */
  if (!j.closed && text.length >= 80) {
    ld.push({
      '@context': 'https://schema.org', '@type': 'JobPosting',
      title: j.title, description: text,
      datePosted: isoDay(j.created_at) || todayIST(),
      ...(j.deadline ? { validThrough: `${j.deadline}T23:59:59+05:30` } : {}),
      hiringOrganization: { '@type': 'Organization', name: j.company },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', ...(j.location ? { addressLocality: j.location } : {}), addressCountry: 'IN' } },
      directApply: false, url,
    });
  }
  const rows = [
    ['Organisation', j.company], ['Category', j.category], ['Location', where],
    ['Eligibility', j.qualification || 'Check official notice'],
    ['Last date', j.deadline ? prettyDate(j.deadline) : 'Check official notice'],
  ].filter(([, v]) => v);
  const body = `
<article class="job-detail">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/jobs/">Jobs</a> › ${esc(j.title)}</nav>
  <h1>${esc(j.title)}</h1>
  <p class="muted">${esc(j.company)} · ${esc(where)}</p>
  ${j.closed ? '<div class="notice closed"><b>Applications closed.</b> This page is kept for reference only. Check the official website for any re-opening.</div>' : ''}
  <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  ${text ? `<p>${esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : '<p>Please read the official notification for full eligibility, vacancy, fee and selection details.</p>'}
  <div class="notice">CareerAxis Academy is an information platform. Always verify every detail on the official source before applying.</div>
  <div class="job-actions">
    <a class="btn outline" href="/jobs/">← All jobs</a>
    ${!j.closed && j.apply ? `<a class="btn primary" href="${esc(j.apply)}" target="_blank" rel="noopener noreferrer">Apply / Official Link</a>` : ''}
  </div>
</article>`;
  return page({ title, description: desc, canonical: url, robots: j.closed ? 'noindex,follow' : undefined, body, ld });
}

function listPage(open) {
  const body = `
<h1>Latest Jobs</h1>
<p class="muted">Current opportunities with official application links. ${open.length} open job${open.length === 1 ? '' : 's'}.</p>
<p><a class="btn primary" href="/#jobs">Search &amp; filter jobs</a></p>
${open.length ? `<ul class="job-list">${open.map((j) => `
  <li><a href="/jobs/${esc(j.slug)}/">${esc(j.title)}</a>
  <small>${esc(j.company)} · ${esc(j.location || 'India')}${j.deadline ? ` · Last date: ${esc(prettyDate(j.deadline))}` : ''}</small></li>`).join('')}</ul>` : '<p class="empty">No open jobs right now. Please check back soon.</p>'}`;
  return page({
    title: 'Latest Jobs – Government, IT & Fresher Openings | CareerAxis Academy',
    description: 'Browse current job openings with official application links, eligibility and last dates on CareerAxis Academy.',
    canonical: `${SITE}/jobs/`, body,
    ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Latest Jobs', url: `${SITE}/jobs/` }],
  });
}

function sitemap(open) {
  const u = (loc, lastmod, freq, prio) => `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    u(`${SITE}/`, todayIST(), 'daily', '1.0'),
    u(`${SITE}/jobs/`, todayIST(), 'daily', '0.9'),
    u(`${SITE}/privacy.html`, '', 'yearly', '0.2'),
    u(`${SITE}/terms.html`, '', 'yearly', '0.2'),
    ...open.map((j) => u(`${SITE}/jobs/${j.slug}/`, isoDay(j.updated_at) || isoDay(j.created_at), 'weekly', '0.8')),
  ].join('\n')}
</urlset>
`;
}

function writeIfChanged(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

function refreshHome(open) {
  const file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) return false;
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf('<!--SEO:START-->');
  const b = html.indexOf('<!--SEO:END-->');
  if (a < 0 || b < a) return false;
  const block = `<!--SEO:START-->
<section class="section seo-prerender">
    <h1>CareerAxis Academy — Free Career &amp; Job Information</h1>
    <p>Job updates, education news, exam updates and preparation resources with official application links.</p>
    ${open.length ? `<ul class="job-list">${open.slice(0, 10).map((j) => `<li><a href="jobs/${esc(j.slug)}/">${esc(j.title)}</a><small>${esc(j.company)} · ${esc(j.location || 'India')}</small></li>`).join('')}</ul>` : ''}
    <p><a href="jobs/">Browse all current jobs</a></p>
</section>
`;
  return writeIfChanged(file, html.slice(0, a) + block + html.slice(b));
}

/* ---------- main ---------- */
const jobs = normalise(await loadJobs());
const open = jobs.filter((j) => !j.closed);
let changed = 0;

for (const j of jobs) if (writeIfChanged(path.join(ROOT, 'jobs', j.slug, 'index.html'), jobPage(j))) changed++;
if (writeIfChanged(path.join(ROOT, 'jobs', 'index.html'), listPage(open))) changed++;
if (writeIfChanged(path.join(ROOT, 'sitemap.xml'), sitemap(open))) changed++;
if (refreshHome(open)) changed++;

/* remove generated pages for jobs that are no longer published (never touches hand-made pages) */
const keep = new Set(jobs.map((j) => j.slug));
const jobsDir = path.join(ROOT, 'jobs');
let removed = 0;
for (const d of fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir, { withFileTypes: true }) : []) {
  if (!d.isDirectory() || keep.has(d.name)) continue;
  const f = path.join(jobsDir, d.name, 'index.html');
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(MARK)) {
    fs.rmSync(path.join(jobsDir, d.name), { recursive: true, force: true });
    removed++;
  }
}
console.log(`SEO build complete: ${jobs.length} published job(s), ${open.length} open, ${changed} file(s) written, ${removed} stale page(s) removed.`);
