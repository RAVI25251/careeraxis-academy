/* CareerAxis Academy - application layer (v2)
   Public information site + protected admin CMS UI.
   Secrets must remain server-side (Supabase Edge Functions / Google services).

   v2 additions: job search + filters, NEW / Closing soon / Closed badges,
   in-app job detail page, hero search, expired-job handling (India time),
   safer empty-link handling, admin fixes (date fields, description field).
*/

const C = window.CAREERAXIS_CONFIG || {};

let data = {
  jobs: [], allJobs: [], resources: [], events: [], videos: [], careerPaths: [],
  education: [], exams: [], results: [], papers: [], guides: [],
  officialLinks: [], announcements: []
};
let lang = localStorage.getItem('careeraxis-lang') || 'en';
let sbPromise = null;
let homeRotationTimers = [];

const $ = (s) => document.querySelector(s);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[m]));

const arr = (v) => Array.isArray(v) ? v : [];

/* Returns a safe absolute URL, or '#' when the value is empty / unsafe. */
const safeUrl = (url) => {
  const raw = String(url ?? '').trim();

  if (!raw || raw === '#') {
    return '#';
  }

  try {
    const u = new URL(raw, location.origin);

    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) {
      return '#';
    }

    return u.href;
  } catch (_) {
    return '#';
  }
};

const fmtDate = (v) => {
  if (!v) return '';

  const d = new Date(v);

  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('en-IN');
};

const t = (en, te) => lang === 'te' ? (te || en) : en;


/* =========================================================
   JOB STATE HELPERS  (India Standard Time, UTC+05:30)
   ========================================================= */

const todayIST = () =>
  new Date(Date.now() + 19800000).toISOString().slice(0, 10);

const isoDay = (v) => {
  const x = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
};

const jobDeadline = (j) => isoDay(j.last_date || j.lastDate);

const daysBetween = (fromIso, toIso) =>
  Math.round(
    (Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) /
    86400000
  );

/* 'closed' | 'closing' | 'new' | 'open' */
function jobState(j) {

  if (j.status === 'archived') {
    return 'closed';
  }

  const today = todayIST();
  const dl = jobDeadline(j);

  if (dl) {

    const left = daysBetween(today, dl);

    if (left < 0) {
      return 'closed';
    }

    if (left <= 7) {
      return 'closing';
    }
  }

  const created = isoDay(j.created_at);

  if (created && daysBetween(created, today) <= 3) {
    return 'new';
  }

  return 'open';
}

const jobKey = (j) => String(j.slug || j.id || '');

const jobSort = (a, b) =>
  (Number(!!b.featured) - Number(!!a.featured)) ||
  String(b.created_at || '').localeCompare(String(a.created_at || ''));


/* =========================================================
   SUPABASE
   ========================================================= */

async function getSupabase() {

  /*
    Reuse the authentication module's Supabase client when
    available. This preserves the existing Google login session.
  */
  if (window.CareerAxisAuth?.getSupabase) {

    const client = await window.CareerAxisAuth.getSupabase();

    if (client) {
      return client;
    }
  }

  if (sbPromise) {
    return sbPromise;
  }

  sbPromise = (async () => {

    if (!C.supabaseUrl || !C.supabaseAnonKey) {
      return null;
    }

    if (!window.supabase?.createClient) {
      return null;
    }

    return window.supabase.createClient(
      C.supabaseUrl,
      C.supabaseAnonKey
    );

  })();

  return sbPromise;
}


async function readTable(table) {

  const sb = await getSupabase();

  if (!sb) {
    return [];
  }

  const { data: rows, error } = await sb
    .from(table)
    .select('*');

  if (error) {

    console.warn(
      `CareerAxis: ${table} unavailable`,
      error.message
    );

    return [];
  }

  return rows || [];
}


/* =========================================================
   LOAD WEBSITE DATA
   ========================================================= */

async function load() {

  let local = {};

  try {

    const r = await fetch('data/content.json', { cache: 'no-store' });

    if (r.ok) {
      local = await r.json();
    }

  } catch (_) {}


  data = {
    jobs: arr(local.jobs),
    allJobs: [],
    resources: arr(local.resources),
    events: arr(local.events),
    videos: arr(local.videos),
    careerPaths: arr(local.careerPaths),
    education: arr(local.education || local.educationUpdates),
    exams: arr(local.exams || local.examUpdates),
    results: arr(local.results),
    papers: arr(local.papers || local.previousPapers),
    guides: arr(local.guides || local.careerGuides),
    officialLinks: arr(local.officialLinks),
    announcements: arr(local.announcements)
  };


  /*
    Supabase content is optional for public browsing.
    When available, PUBLISHED database records are used.
  */
  const tableMap = [
    ['jobs', 'jobs'],
    ['resources', 'resources'],
    ['events', 'calendar_events'],
    ['videos', 'youtube_videos'],
    ['careerPaths', 'career_paths'],
    ['education', 'education_updates'],
    ['exams', 'exams'],
    ['results', 'exam_results'],
    ['papers', 'previous_papers'],
    ['guides', 'career_guides'],
    ['officialLinks', 'official_links'],
    ['announcements', 'announcements']
  ];

  await Promise.all(
    tableMap.map(async ([key, table]) => {

      const rows = await readTable(table);

      if (rows.length) {

        data[key] = rows.filter(
          (x) => x.published === undefined || x.published === true
        );
      }
    })
  );


  /*
    v2: allJobs keeps every published job (the Jobs page can show closed
    ones); jobs is the open list used on the home page.
  */
  data.allJobs = data.jobs.slice().sort(jobSort);
  data.jobs = data.allJobs.filter((j) => jobState(j) !== 'closed');

  render();

  bindSocial();
}


/* =========================================================
   SOCIAL LINKS
   ========================================================= */

function bindSocial() {

  document
    .querySelectorAll('[data-social]')
    .forEach((a) => {

      const u = safeUrl(C.social?.[a.dataset.social]);

      a.href = u;

      if (u === '#') {
        a.style.opacity = '.45';
      }
    });
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(route) {

  location.hash = route;
}


function currentRoute() {

  const params = new URLSearchParams(location.search);

  if (params.get('admin') === 'secure') {
    return { name: 'admin', arg: '', qs: new URLSearchParams() };
  }

  const raw = location.hash.slice(1) || 'home';
  const [path, query = ''] = raw.split('?');
  const [name, ...rest] = path.split('/');

  return {
    name: name || 'home',
    arg: rest.join('/'),
    qs: new URLSearchParams(query)
  };
}


const ROUTE_TITLES = {
  jobs: 'Latest Jobs',
  careers: 'Career Paths',
  education: 'Education Updates',
  exams: 'Exam Updates',
  results: 'Results',
  papers: 'Previous Papers',
  resources: 'Free Resources',
  announcements: 'Announcements',
  calendar: 'Job and Exam Calendar',
  youtube: 'YouTube Videos',
  community: 'Community',
  about: 'About',
  contact: 'Contact'
};


function render() {

  clearHomeRotationTimers();

  const route = currentRoute();

  if (
    route.name === C.adminRoute ||
    route.name === 'admin'
  ) {

    admin();

    return;
  }


  const pages = {
    home, jobs, careers, education, exams, results, papers,
    resources, announcements, calendar, youtube, community,
    about, contact
  };


  document.title =
    ROUTE_TITLES[route.name]
      ? `${ROUTE_TITLES[route.name]} | CareerAxis Academy`
      : 'CareerAxis Academy — Knowledge to Success';

  if (route.name === 'job') {

    jobDetail(route.arg);

  } else {

    (pages[route.name] || home)();
  }

  if ($('#nav')) {
    $('#nav').classList.remove('open');
  }

  if ($('#menu')) {
    $('#menu').setAttribute('aria-expanded', 'false');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  bindSocial();
}


/* =========================================================
   COMMON UI
   ========================================================= */

function pageShell(title, subtitle, body) {

  return `
    <section class="section">

      <div class="section-head">

        <div>

          <h1>${esc(title)}</h1>

          <p class="muted">${esc(subtitle)}</p>

        </div>

      </div>

      ${body}

    </section>
  `;
}


function empty(msg) {

  return `
    <div class="empty" style="grid-column:1/-1">
      ${esc(msg)}
    </div>
  `;
}


/* =========================================================
   JOB CARD
   ========================================================= */

function jobBadge(j) {

  const state = jobState(j);

  if (state === 'closed') {
    return '<span class="badge badge-closed">Applications closed</span>';
  }

  if (state === 'closing') {

    const left = daysBetween(todayIST(), jobDeadline(j));

    return `<span class="badge badge-warn">${
      left === 0 ? 'Last day today' : 'Closing soon'
    }</span>`;
  }

  if (state === 'new') {
    return '<span class="badge badge-new">New</span>';
  }

  return '';
}


function jobCard(j) {

  const url = safeUrl(
    j.applyUrl ||
    j.apply_url ||
    j.official_link ||
    j.url
  );

  const closed = jobState(j) === 'closed';
  const dl = jobDeadline(j);
  const key = jobKey(j);


  return `
    <article class="card job-card${closed ? ' is-closed' : ''}">

      <div class="job-top">

        <span class="tag">
          ${esc(j.category || j.job_category || 'Job')}
        </span>

        ${jobBadge(j)}

      </div>

      <div class="job-title">
        ${esc(j.title || j.name)}
      </div>

      <b>
        ${esc(j.company || j.organization || '')}
      </b>

      <p class="muted">
        ${esc(j.location || 'India')}
        ·
        ${esc(j.qualification || j.eligibility || 'Check official notice')}
      </p>

      <p>
        <b>Last date:</b>
        ${esc(
          dl
            ? fmtDate(dl + 'T00:00:00')
            : (j.lastDate || j.last_date || 'Check official notice')
        )}
      </p>

      <div class="job-actions">

        ${
          key
            ? `
              <a
                class="btn outline"
                href="#job/${encodeURIComponent(key)}"
              >
                View Details
              </a>
            `
            : ''
        }

        ${
          url !== '#' && !closed
            ? `
              <a
                class="btn primary"
                href="${esc(url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply / Official Link
              </a>
            `
            : ''
        }

      </div>

    </article>
  `;
}


/* =========================================================
   YOUTUBE CARD
   ========================================================= */

function videoCard(v) {

  const url = safeUrl(
    v.url ||
    v.video_url ||
    v.youtube_url
  );

  const thumb = v.thumbnail || v.thumbnail_url || '';


  return `
    <article class="card video-card">

      ${
        safeUrl(thumb) !== '#'
          ? `
            <img
              src="${esc(safeUrl(thumb))}"
              alt=""
              loading="lazy"
              style="width:100%;border-radius:12px"
            >
          `
          : `<div class="thumb">▶</div>`
      }

      <div class="body">

        <span class="tag">YouTube</span>

        <div class="job-title">
          ${esc(v.title || v.name)}
        </div>

        <p class="muted">

          ${esc(v.category || '')}

          ${
            v.published_at || v.publishedAt
              ? ' · ' + esc(fmtDate(v.published_at || v.publishedAt))
              : ''
          }

        </p>

        ${
          url !== '#'
            ? `
              <a
                class="btn primary"
                href="${esc(url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Now
              </a>
            `
            : ''
        }

      </div>

    </article>
  `;
}


/* =========================================================
   RESOURCE CARD
   ========================================================= */

function resourceCard(r) {

  const url = safeUrl(
    r.driveUrl ||
    r.drive_url ||
    r.url ||
    r.official_link
  );


  return `
    <article class="card">

      <span class="tag">
        ${esc(r.category || r.company || 'Resource')}
      </span>

      <div class="job-title">
        ${esc(r.title || r.name)}
      </div>

      <p class="muted">
        ${esc(r.description || 'Free preparation resource')}
      </p>

      ${
        r.file_type
          ? `<p class="tiny">File: ${esc(r.file_type)}</p>`
          : ''
      }

      ${
        url !== '#'
          ? `
            <a
              class="btn primary"
              href="${esc(url)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              View / Download
            </a>
          `
          : ''
      }

    </article>
  `;
}


/* =========================================================
   SOCIAL CARD
   ========================================================= */

function socialCard(name, desc, key, icon) {

  const url = safeUrl(C.social?.[key]);


  return `
    <a
      class="social"
      data-social="${esc(key)}"
      href="${esc(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >

      <div style="font-size:26px">${icon}</div>

      <b>${esc(name)}</b>

      <span class="muted">${esc(desc)}</span>

    </a>
  `;
}


/* =========================================================
   INFORMATION CARD
   ========================================================= */

function infoCard(x) {

  const url = safeUrl(
    x.official_link ||
    x.officialLink ||
    x.url ||
    x.result_url
  );


  return `
    <article class="card">

      <span class="tag">
        ${esc(x.category || x.type || 'Update')}
      </span>

      <div class="job-title">
        ${esc(x.title || x.exam || x.name)}
      </div>

      <p class="muted">
        ${esc(x.description || x.status || x.result_status || '')}
      </p>

      ${
        x.date || x.result_date
          ? `
            <p>
              <b>Date:</b>
              ${esc(fmtDate(x.date || x.result_date))}
            </p>
          `
          : ''
      }

      ${
        url !== '#'
          ? `
            <a
              class="btn primary"
              href="${esc(url)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          `
          : ''
      }

    </article>
  `;
}


/* =========================================================
   HOME PAGE
   ========================================================= */

function topJobCategories(limit) {

  const count = {};

  data.jobs.forEach((j) => {

    const c = String(j.category || '').trim();

    if (c) {
      count[c] = (count[c] || 0) + 1;
    }
  });

  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}


const homeSections = () => [

  {
    title: 'Latest Jobs',
    subtitle: 'Current opportunities and official application links',
    items: data.jobs,
    card: jobCard,
    empty: 'No published jobs yet.',
    more: 'View All Job Updates →',
    href: '#jobs',
    noun: 'job updates'
  },

  {
    title: 'Education Updates',
    subtitle: 'Admissions, notifications, counselling and important education information',
    items: data.education,
    card: infoCard,
    empty: 'No education updates yet.',
    more: 'View All Education Updates →',
    href: '#education',
    noun: 'education updates'
  },

  {
    title: 'Latest YouTube Videos',
    subtitle: 'Job updates and practical career guidance',
    items: data.videos,
    card: videoCard,
    empty: 'No YouTube videos published yet.',
    more: 'View All YouTube Videos →',
    href: '#youtube',
    noun: 'YouTube videos'
  },

  {
    title: 'Latest Announcements',
    subtitle: 'Important CareerAxis Academy announcements',
    items: data.announcements,
    card: infoCard,
    empty: 'No announcements yet.',
    more: 'View All Announcements →',
    href: '#announcements',
    noun: 'announcements'
  },

  {
    title: 'Free Resources',
    subtitle: 'Preparation resources and previous papers',
    items: data.resources,
    card: resourceCard,
    empty: 'No resources published yet.',
    more: 'View All Free Resources →',
    href: '#resources',
    noun: 'free resources'
  }
];


function home() {

  const chips = topJobCategories(4);

  $('#app').innerHTML = `

    <section class="hero">

      <div class="hero-inner">

        <div>

          <div class="tag">
            FREE CAREER &amp; JOB INFORMATION
          </div>

          <h1>
            ${t(
              'Turn Knowledge Into Career Success',
              'జ్ఞానాన్ని కెరీర్ విజయంగా మార్చుకోండి'
            )}
          </h1>

          <p>
            ${t(
              'Free job updates, career guidance, education information, exam updates, preparation resources and practical career techniques in English and Telugu.',
              'ఉద్యోగ సమాచారం, కెరీర్ గైడెన్స్, విద్యా సమాచారం, పరీక్షా అప్‌డేట్స్ మరియు ఉచిత ప్రిపరేషన్ వనరులు ఇంగ్లీష్ మరియు తెలుగులో.'
            )}
          </p>

          <form class="hero-search" id="heroSearch">

            <input
              class="search"
              id="heroQuery"
              aria-label="Search jobs"
              placeholder="Search jobs, companies or qualifications"
            >

            <button class="btn primary" type="submit">
              Search Jobs
            </button>

          </form>

          ${
            chips.length
              ? `
                <div class="chips">
                  ${chips
                    .map((c) => `
                      <button
                        type="button"
                        class="chip"
                        data-jobq="${esc(c)}"
                      >
                        ${esc(c)}
                      </button>
                    `)
                    .join('')}
                </div>
              `
              : ''
          }

          <div class="actions">

            <a class="btn primary" href="#jobs">
              Explore Jobs
            </a>

            <a class="btn secondary" href="#careers">
              Explore Career Paths
            </a>

          </div>

        </div>


        <div class="hero-card">

          <img
            src="assets/careeraxis-logo.png"
            alt="CareerAxis Academy logo"
          >

          <p style="text-align:center;margin:14px 0 0">
            CareerAxis Academy
          </p>

        </div>

      </div>

    </section>


    ${homeSections().map(rotatingSectionBlock).join('')}


    <section class="section community">

      <div class="section-head">

        <div>

          <h2>Join CareerAxis Academy Community</h2>

          <p class="muted">
            Stay updated across official social channels.
          </p>

        </div>

      </div>


      <div class="socials">

        ${socialCard('YouTube', 'Subscribe for job and career updates', 'youtube', '▶')}

        ${socialCard('Telegram', 'Join the latest update channel', 'telegram', '✈')}

        ${socialCard('WhatsApp', 'Join the community', 'whatsapp', '◉')}

        ${socialCard('Instagram', 'Follow CareerAxis Academy', 'instagram', '◎')}

      </div>

    </section>
  `;


  const form = $('#heroSearch');

  if (form) {

    form.onsubmit = (e) => {

      e.preventDefault();

      navigate('jobs?q=' + encodeURIComponent($('#heroQuery').value.trim()));
    };
  }

  document
    .querySelectorAll('[data-jobq]')
    .forEach((b) => {

      b.onclick = () =>
        navigate('jobs?q=' + encodeURIComponent(b.dataset.jobq));
    });

  initHomeRotations();
}


/* =========================================================
   HOME PAGE ROTATING SECTIONS
   ========================================================= */

function clearHomeRotationTimers() {

  homeRotationTimers.forEach((timer) => clearInterval(timer));

  homeRotationTimers = [];
}


function rotatingSectionBlock(s, index) {

  return `

    <section class="section">

      <div class="section-head">

        <div>

          <h2>${esc(s.title)}</h2>

          <p class="muted">${esc(s.subtitle)}</p>

        </div>

      </div>


      <div
        class="grid"
        data-rotating-section="true"
        data-rotation-index="${index}"
        style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))"
      >

        ${renderRotatingCards(s, 0)}

      </div>

    </section>
  `;
}


function renderRotatingCards(s, startIndex) {

  const items = Array.isArray(s.items) ? s.items : [];
  const count = items.length;

  let cards = '';

  if (count > 0) {

    const visible = Math.min(3, count);

    for (let offset = 0; offset < visible; offset++) {

      cards += s.card(items[(startIndex + offset) % count]);
    }
  }

  const ctaDescription =
    count > 0
      ? `Explore all available ${esc(s.noun)} on CareerAxis Academy.`
      : esc(s.empty);

  cards += `

    <article
      class="card"
      style="
        display:flex;
        flex-direction:column;
        justify-content:center;
        text-align:center;
        min-height:220px;
      "
    >

      <span class="tag">CareerAxis Academy</span>

      <div class="job-title" style="margin-top:10px">
        ${esc(s.more)}
      </div>

      <p class="muted">${ctaDescription}</p>

      <a class="btn primary" href="${esc(s.href)}">
        View All →
      </a>

    </article>
  `;

  return cards;
}


function initHomeRotations() {

  const sections = homeSections();

  document
    .querySelectorAll('[data-rotating-section="true"]')
    .forEach((el) => {

      const s = sections[Number(el.dataset.rotationIndex)];

      if (!s || !Array.isArray(s.items) || s.items.length <= 3) {
        return;
      }

      let startIndex = 0;

      const timer = setInterval(() => {

        if (!document.body.contains(el)) {
          return;
        }

        startIndex = (startIndex + 1) % s.items.length;

        el.innerHTML = renderRotatingCards(s, startIndex);

      }, 8000);

      homeRotationTimers.push(timer);
    });
}


/* =========================================================
   JOBS PAGE (search + filters)
   ========================================================= */

function jobs() {

  const all = data.allJobs;

  const initialQuery = currentRoute().qs.get('q') || '';

  const unique = (key) =>
    [...new Set(
      all.map((j) => String(j[key] || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

  const options = (list) =>
    list.map((x) => `<option>${esc(x)}</option>`).join('');


  $('#app').innerHTML =
    pageShell(
      'Latest Jobs',
      'Search current opportunities. Always verify details on the official employer page.',

      `
        <div class="job-filters">

          <input
            class="search"
            id="jobSearch"
            placeholder="Search company, job title, category or qualification..."
            value="${esc(initialQuery)}"
          >

          <select id="jobCategory" aria-label="Category">
            <option value="">All categories</option>
            ${options(unique('category'))}
          </select>

          <select id="jobLocation" aria-label="Location">
            <option value="">All locations</option>
            ${options(unique('location'))}
          </select>

          <select id="jobSort" aria-label="Sort">
            <option value="new">Newest first</option>
            <option value="closing">Closing soon</option>
          </select>

          <label class="job-toggle">
            <input type="checkbox" id="jobClosed">
            Show closed
          </label>

        </div>

        <p class="muted" id="jobCount"></p>

        <div class="grid" id="jobGrid"></div>
      `
    );


  const refresh = () => {

    const q = $('#jobSearch').value.trim().toLowerCase();
    const cat = $('#jobCategory').value;
    const loc = $('#jobLocation').value;
    const showClosed = $('#jobClosed').checked;
    const sort = $('#jobSort').value;

    let rows = all
      .filter((j) => showClosed || jobState(j) !== 'closed')
      .filter((j) => !cat || String(j.category || '').trim() === cat)
      .filter((j) => !loc || String(j.location || '').trim() === loc)
      .filter((j) =>
        !q ||
        [
          j.title, j.name, j.company, j.organization,
          j.category, j.location, j.qualification
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );

    rows = sort === 'closing'
      ? rows.sort((a, b) =>
          (jobDeadline(a) || '9999-12-31')
            .localeCompare(jobDeadline(b) || '9999-12-31')
        )
      : rows.sort(jobSort);

    $('#jobCount').textContent =
      `${rows.length} job${rows.length === 1 ? '' : 's'} found`;

    $('#jobGrid').innerHTML =
      rows.map(jobCard).join('') ||
      empty(all.length ? 'No matching jobs.' : 'No published jobs yet.');
  };

  $('#jobSearch').oninput = refresh;
  $('#jobCategory').onchange = refresh;
  $('#jobLocation').onchange = refresh;
  $('#jobSort').onchange = refresh;
  $('#jobClosed').onchange = refresh;

  refresh();
}


/* =========================================================
   JOB DETAIL PAGE
   ========================================================= */

function jobDetail(rawKey) {

  let key = rawKey;

  try {
    key = decodeURIComponent(rawKey);
  } catch (_) {}

  const j = data.allJobs.find((x) => jobKey(x) === key);

  if (!j) {

    $('#app').innerHTML =
      pageShell(
        'Job not found',
        'This job may have been removed.',
        `<a class="btn primary" href="#jobs">Back to all jobs</a>`
      );

    return;
  }

  const url = safeUrl(j.applyUrl || j.apply_url || j.official_link || j.url);
  const closed = jobState(j) === 'closed';
  const dl = jobDeadline(j);
  const shareLink = `${location.origin}/#job/${encodeURIComponent(jobKey(j))}`;
  const shareText = `${j.title || ''} - ${j.company || ''}`;

  document.title = `${j.title || 'Job'} | CareerAxis Academy`;

  $('#app').innerHTML =
    pageShell(
      j.title || 'Job details',
      j.company || '',

      `
        <article class="card job-detail">

          <div class="job-top">
            <span class="tag">${esc(j.category || 'Job')}</span>
            ${jobBadge(j)}
          </div>

          <dl>
            <dt>Organisation</dt><dd>${esc(j.company || '')}</dd>
            <dt>Location</dt><dd>${esc(j.location || 'India')}</dd>
            <dt>Eligibility</dt><dd>${esc(j.qualification || 'Check official notice')}</dd>
            <dt>Last date</dt><dd>${esc(dl ? fmtDate(dl + 'T00:00:00') : 'Check official notice')}</dd>
          </dl>

          <p>
            ${esc(
              j.description ||
              'Please read the official notification for full eligibility, vacancy, fee and selection details.'
            )}
          </p>

          ${
            closed
              ? '<div class="notice closed"><b>Applications closed.</b> Check the official website for any re-opening.</div>'
              : ''
          }

          <div class="notice">
            CareerAxis Academy is an information platform. Verify every
            detail on the official source before applying.
          </div>

          <div class="job-actions">

            <a class="btn outline" href="#jobs">← All jobs</a>

            ${
              url !== '#' && !closed
                ? `
                  <a
                    class="btn primary"
                    href="${esc(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply / Official Link
                  </a>
                `
                : ''
            }

            <a
              class="btn outline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareLink)}"
            >
              Share on WhatsApp
            </a>

            <a
              class="btn outline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}"
            >
              Share on Telegram
            </a>

          </div>

        </article>
      `
    );
}


/* =========================================================
   CAREER PATHS
   ========================================================= */

function careers() {

  const paths =
    data.careerPaths.length
      ? data.careerPaths
      : [
          'Career After 10th', 'Career After 12th', 'MPC', 'Bi.P.C',
          'MEC', 'CEC', 'B.Tech', 'IT Careers', 'Medical Careers',
          'MBBS', 'Engineering', 'Government Careers'
        ];

  $('#app').innerHTML =
    pageShell(
      'Career Paths',
      'Simple guidance from school to professional careers.',

      `
        <div class="grid">

          ${paths
            .map((x) =>
              typeof x === 'string'
                ? `
                  <article class="card">

                    <span class="tag">Career Path</span>

                    <div class="job-title">${esc(x)}</div>

                    <p class="muted">
                      Guidance, exams, skills, jobs and free resources will be published here.
                    </p>

                  </article>
                `
                : infoCard(x)
            )
            .join('')}

        </div>
      `
    );
}


/* =========================================================
   SIMPLE LIST PAGES
   ========================================================= */

function listPage(title, subtitle, items, renderer, emptyMsg) {

  $('#app').innerHTML =
    pageShell(
      title,
      subtitle,
      `
        <div class="grid">
          ${items.map(renderer).join('') || empty(emptyMsg)}
        </div>
      `
    );
}

function education() {
  listPage(
    'Education Updates',
    'Intermediate, MPC, Bi.P.C, admissions, scholarships and education notifications.',
    data.education, infoCard, 'No education updates yet.'
  );
}

function exams() {
  listPage(
    'Exam Updates',
    'Notifications, application dates, hall tickets, exams, answer keys and counselling.',
    data.exams, infoCard, 'No exam updates yet.'
  );
}

function results() {
  listPage(
    'Results',
    'Redirect to official result pages. CareerAxis Academy does not recreate official result systems.',
    data.results, infoCard, 'No result updates yet.'
  );
}

function papers() {
  listPage(
    'Previous Papers',
    'Legally shareable previous papers and preparation materials.',
    data.papers, resourceCard, 'No previous papers published yet.'
  );
}

function resources() {
  listPage(
    'Free Resources',
    'Organized by company, exam and career path.',
    data.resources, resourceCard, 'No resources published yet.'
  );
}

function announcements() {
  listPage(
    'Latest Announcements',
    'Important CareerAxis Academy announcements and updates.',
    data.announcements, infoCard, 'No announcements yet.'
  );
}


/* =========================================================
   CALENDAR
   ========================================================= */

function calendar() {

  const when = (e) => e.date || e.event_date || '';

  const events = [...data.events].sort(
    (a, b) => String(when(a)).localeCompare(String(when(b)))
  );

  const card = (e) => {

    const link = safeUrl(e.official_link || e.official_url || e.url);

    return `
      <article class="card">

        <span class="tag">${esc(e.type || e.event_type || 'Event')}</span>

        <div class="job-title">${esc(e.title || e.name)}</div>

        <b>${esc(fmtDate(when(e)))}</b>

        <p class="muted">${esc(e.description || '')}</p>

        ${
          link !== '#'
            ? `
              <a
                class="btn primary"
                href="${esc(link)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Source
              </a>
            `
            : ''
        }

      </article>
    `;
  };

  listPage(
    'Job & Exam Calendar',
    'Deadlines, exams, result dates and important career events.',
    events, card, 'No upcoming events.'
  );
}


/* =========================================================
   YOUTUBE
   ========================================================= */

function youtube() {

  const channel = safeUrl(C.youtubeChannelUrl || C.social?.youtube);

  $('#app').innerHTML =
    pageShell(
      'CareerAxis Academy on YouTube',
      'Job notifications, preparation and career guidance.',

      `
        <div style="margin-bottom:18px">

          ${
            channel !== '#'
              ? `
                <a
                  class="btn primary"
                  href="${esc(channel)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Subscribe on YouTube
                </a>
              `
              : ''
          }

        </div>

        <div class="grid">
          ${
            data.videos.map(videoCard).join('') ||
            empty('No videos published yet.')
          }
        </div>
      `
    );
}


/* =========================================================
   COMMUNITY / ABOUT / CONTACT
   ========================================================= */

function community() {

  $('#app').innerHTML =
    pageShell(
      'Join the Community',
      'Official CareerAxis Academy social links.',

      `
        <div class="socials">

          ${socialCard('YouTube', 'Subscribe', 'youtube', '▶')}
          ${socialCard('Telegram', 'Join channel', 'telegram', '✈')}
          ${socialCard('WhatsApp', 'Join community', 'whatsapp', '◉')}
          ${socialCard('Instagram', 'Follow', 'instagram', '◎')}

        </div>
      `
    );
}


function about() {

  $('#app').innerHTML =
    pageShell(
      'About CareerAxis Academy',
      'A free career and education information platform.',

      `
        <div class="card">

          <h2>Knowledge to Success</h2>

          <p>
            CareerAxis Academy organizes job information, career guidance,
            education updates, exam updates, results, previous papers, free
            resources and practical YouTube content.
          </p>

          <p class="muted">
            CareerAxis Academy is an information platform and is not an
            official government, university or examination authority.
          </p>

        </div>
      `
    );
}


function contact() {

  $('#app').innerHTML =
    pageShell(
      'Contact Us',
      'We would be happy to hear from you.',

      `
        <div class="card">

          <h2>CareerAxis Academy</h2>

          <p>
            Email:
            <a href="mailto:careeraxisacademy@gmail.com">
              careeraxisacademy@gmail.com
            </a>
          </p>

          <p class="muted">
            For official information, always verify details with the
            relevant government, university, examination authority or employer.
          </p>

        </div>
      `
    );
}


/* =========================================================
   ADMIN TABLE CONFIGURATION
   [column, label, input type]
   ========================================================= */

const ADMIN_TABLES = {

  jobs: {
    label: 'Jobs',
    table: 'jobs',
    fields: [
      ['title', 'Title', 'text'],
      ['company', 'Company / Organization', 'text'],
      ['category', 'Category', 'text'],
      ['location', 'Location', 'text'],
      ['qualification', 'Eligibility / Qualification', 'text'],
      ['last_date', 'Last Date', 'date'],
      ['apply_url', 'Official Apply URL', 'url'],
      ['description', 'Description (shown on the job page, 80+ characters helps Google)', 'textarea'],
      ['featured', 'Featured', 'checkbox'],
      ['published', 'Published', 'checkbox']
    ]
  },

  education: {
    label: 'Education Updates',
    table: 'education_updates',
    fields: [
      ['title', 'Title', 'text'],
      ['category', 'Category', 'text'],
      ['description', 'Description', 'textarea'],
      ['date', 'Date', 'date'],
      ['official_link', 'Official Link', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  },

  exams: {
    label: 'Exam Updates',
    table: 'exams',
    fields: [
      ['title', 'Exam / Update', 'text'],
      ['category', 'Category', 'text'],
      ['status', 'Status', 'text'],
      ['date', 'Important Date', 'date'],
      ['official_link', 'Official Link', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  },

  results: {
    label: 'Results',
    table: 'exam_results',
    fields: [
      ['exam', 'Exam', 'text'],
      ['result_status', 'Result Status', 'text'],
      ['result_date', 'Result Date', 'date'],
      ['official_link', 'Official Result Link', 'url'],
      ['official_source', 'Official Source', 'text'],
      ['published', 'Published', 'checkbox']
    ]
  },

  events: {
    label: 'Calendar',
    table: 'calendar_events',
    fields: [
      ['title', 'Event Title', 'text'],
      ['type', 'Event Type', 'text'],
      ['date', 'Date', 'date'],
      ['description', 'Description', 'textarea'],
      ['official_link', 'Official Link', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  },

  careers: {
    label: 'Career Paths',
    table: 'career_paths',
    fields: [
      ['title', 'Career Path Title', 'text'],
      ['category', 'Category', 'text'],
      ['description', 'Description', 'textarea'],
      ['official_link', 'Official Link', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  },

  guides: {
    label: 'Career Guides',
    table: 'career_guides',
    fields: [
      ['title', 'Guide Title', 'text'],
      ['category', 'Category', 'text'],
      ['description', 'Description', 'textarea'],
      ['content', 'Guide Content', 'textarea'],
      ['published', 'Published', 'checkbox']
    ]
  },

  papers: {
    label: 'Previous Papers',
    table: 'previous_papers',
    fields: [
      ['title', 'Title', 'text'],
      ['year', 'Year', 'text'],
      ['subject', 'Subject', 'text'],
      ['category', 'Category', 'text'],
      ['language', 'Language', 'text'],
      ['file_type', 'File Type', 'text'],
      ['drive_url', 'Drive URL', 'url'],
      ['official_source', 'Official Source', 'text'],
      ['published', 'Published', 'checkbox']
    ]
  },

  resources: {
    label: 'Resources',
    table: 'resources',
    fields: [
      ['title', 'Title', 'text'],
      ['category', 'Category', 'text'],
      ['company', 'Company / Exam', 'text'],
      ['description', 'Description', 'textarea'],
      ['drive_url', 'Drive URL', 'url'],
      ['drive_file_id', 'Drive File ID', 'text'],
      ['published', 'Published', 'checkbox'],
      ['download_enabled', 'Download Enabled', 'checkbox']
    ]
  },

  videos: {
    label: 'YouTube Videos',
    table: 'youtube_videos',
    fields: [
      ['title', 'Title', 'text'],
      ['category', 'Category', 'text'],
      ['url', 'YouTube URL', 'url'],
      ['thumbnail_url', 'Thumbnail URL', 'url'],
      ['published_at', 'Published At', 'datetime-local'],
      ['published', 'Published', 'checkbox']
    ]
  },

  officialLinks: {
    label: 'Official Links',
    table: 'official_links',
    fields: [
      ['title', 'Name', 'text'],
      ['category', 'Category', 'text'],
      ['description', 'Description', 'textarea'],
      ['url', 'Official URL', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  },

  announcements: {
    label: 'Announcements',
    table: 'announcements',
    fields: [
      ['title', 'Title', 'text'],
      ['description', 'Description', 'textarea'],
      ['url', 'Link', 'url'],
      ['published', 'Published', 'checkbox']
    ]
  }
};


/* =========================================================
   REQUIRE ADMIN
   ========================================================= */

async function requireAdmin() {

  const auth = window.CareerAxisAuth;

  if (!auth) {
    throw new Error('Authentication module unavailable.');
  }

  const state = await auth.initAdminAuth();

  if (!state.configured) {
    throw new Error('Supabase authentication is not configured.');
  }

  if (!state.user) {
    throw new Error('Please sign in with Google.');
  }

  if (!state.authorized) {
    throw new Error('Access denied for this Google account.');
  }

  if (!auth.hasRecentOtpVerification()) {
    throw new Error('Admin OTP verification is required.');
  }

  return { auth, state, sb: await getSupabase() };
}


/* =========================================================
   ADMIN MAIN
   ========================================================= */

async function admin() {

  document.title = 'CareerAxis Academy — Secure Admin';

  const auth = window.CareerAxisAuth;

  if (!auth) {

    $('#app').innerHTML =
      pageShell('Admin', '', empty('Authentication module unavailable.'));

    return;
  }

  let state;

  try {

    state = await auth.initAdminAuth();

  } catch (e) {

    $('#app').innerHTML =
      pageShell('Admin', '', `<div class="empty">${esc(e.message)}</div>`);

    return;
  }


  if (!state.configured) {

    $('#app').innerHTML =
      pageShell(
        'Secure Admin',
        '',
        `
          <div class="admin-box">
            <h2>Supabase is not configured</h2>
            <p>Configure site-config.js first.</p>
          </div>
        `
      );

    return;
  }


  if (!state.user) {

    $('#app').innerHTML =
      pageShell(
        'Admin Sign In',
        'Private area',
        `
          <div class="admin-box">

            <button class="btn primary" id="googleAdmin">
              Continue with Google
            </button>

            <p class="tiny">
              Only the two authorized CareerAxis Academy accounts can continue.
            </p>

          </div>
        `
      );

    $('#googleAdmin').onclick = async () => {

      try {

        await auth.signInWithGoogle();

      } catch (e) {

        alert(e.message);
      }
    };

    return;
  }


  if (!state.authorized) {

    $('#app').innerHTML =
      pageShell(
        'Access Denied',
        '',
        `
          <div class="empty">
            You are not authorized to access the administration panel.
          </div>
        `
      );

    return;
  }


  if (!auth.hasRecentOtpVerification()) {

    renderOtpGate(auth, state);

    return;
  }


  renderAdminHome(state);
}


/* =========================================================
   ADMIN OTP
   ========================================================= */

function renderOtpGate(auth, state) {

  $('#app').innerHTML =
    pageShell(
      'Verify Admin OTP',
      'Second factor required',

      `
        <div class="admin-box">

          <p>
            Google authentication succeeded for
            <b>${esc(state.user.email)}</b>.
          </p>

          <p>
            OTP destination:
            <b>${esc(C.otpDestinationLabel || 'protected mailbox')}</b>
          </p>

          <button class="btn primary" id="sendOtp">
            Send OTP
          </button>

          <div id="otpForm" style="display:none;margin-top:18px">

            <input
              class="search"
              id="otpCode"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="Enter 6-digit OTP"
            >

            <button
              class="btn primary"
              id="verifyOtp"
              style="margin-top:10px"
            >
              Verify OTP
            </button>

          </div>

          <p id="otpMsg" class="tiny"></p>

          <button class="btn" id="logoutAdmin">
            Sign out
          </button>

        </div>
      `
    );


  $('#sendOtp').onclick = async () => {

    const b = $('#sendOtp');

    b.disabled = true;

    try {

      await auth.requestAdminOtp();

      $('#otpForm').style.display = 'block';

      $('#otpMsg').textContent =
        'OTP sent. It expires quickly and can be used once.';

    } catch (e) {

      $('#otpMsg').textContent = e.message;

      b.disabled = false;
    }
  };


  $('#verifyOtp').onclick = async () => {

    const code = $('#otpCode').value.trim();

    if (!/^\d{6}$/.test(code)) {

      alert('Enter the 6-digit OTP.');

      return;
    }

    try {

      await auth.verifyAdminOtp(code);

      render();

    } catch (e) {

      alert(e.message);
    }
  };


  $('#logoutAdmin').onclick = auth.signOutAdmin;
}


/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

function renderAdminHome(state) {

  const items = Object.entries(ADMIN_TABLES)
    .map(([key, cfg]) => `
      <button class="btn" data-admin-section="${esc(key)}">
        ${esc(cfg.label)}
      </button>
    `)
    .join('');


  $('#app').innerHTML = `

    <section class="section">

      <div class="section-head">

        <div>

          <span class="tag">ADMIN</span>

          <h1>CareerAxis Academy Control Center</h1>

          <p class="muted">
            Signed in as ${esc(state.user.email)} · OTP verified.
          </p>

        </div>

        <button class="btn" id="logoutAdmin">Sign out</button>

      </div>


      <div class="card" style="margin-bottom:18px">

        <h3>Content Management</h3>

        <p class="muted">
          Add, edit, publish and unpublish website information without editing HTML.
          Jobs found by the automation arrive as unpublished drafts — review them
          under <b>Jobs</b> and tick Published.
        </p>

        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${items}
        </div>

      </div>


      <div class="grid">

        <div class="card">

          <span class="tag">Google Drive</span>

          <div class="job-title">Folder Mapping</div>

          <p class="muted">
            Connected through the protected drive-manager Edge Function.
          </p>

          <button class="btn primary" id="manageDriveMappings">
            Manage mappings
          </button>

          <div
            id="driveMappingsPanel"
            style="display:none;margin-top:16px"
          ></div>

        </div>


        <div class="card">

          <span class="tag">YouTube</span>

          <div class="job-title">Channel Integration</div>

          <p class="muted">
            Channel: ${esc(C.youtubeChannelId || 'Not configured')}
          </p>

          <button class="btn primary" data-admin-section="videos">
            Manage videos
          </button>

        </div>


        <div class="card">

          <span class="tag">Security</span>

          <div class="job-title">2 Admin Accounts + OTP</div>

          <p class="muted">
            Google OAuth + server-side OTP verification.
          </p>

        </div>


        <div class="card">

          <span class="tag">Automation</span>

          <div class="job-title">Sync Center</div>

          <p class="muted">
            GitHub Actions runs at 09:00 and 18:00 IST: expires closed jobs,
            collects drafts from approved sources and refreshes job pages
            and the sitemap.
          </p>

          <p class="tiny">No secrets are stored in app.js.</p>

        </div>

      </div>


      <div id="adminWorkspace" style="margin-top:18px"></div>

    </section>
  `;


  $('#logoutAdmin').onclick = window.CareerAxisAuth.signOutAdmin;

  $('#manageDriveMappings').onclick = manageDriveMappings;

  document
    .querySelectorAll('[data-admin-section]')
    .forEach((b) => {

      b.onclick = () => openAdminSection(b.dataset.adminSection);
    });
}


/* =========================================================
   OPEN ADMIN CONTENT SECTION
   ========================================================= */

async function openAdminSection(key) {

  const cfg = ADMIN_TABLES[key];

  if (!cfg) {
    return;
  }

  const workspace = $('#adminWorkspace');

  if (!workspace) {
    return;
  }

  workspace.innerHTML = `
    <div class="card">
      <p class="muted">Loading ${esc(cfg.label)} …</p>
    </div>
  `;


  try {

    const { sb } = await requireAdmin();

    if (!sb) {
      throw new Error('Supabase client unavailable.');
    }

    const { data: rows, error } = await sb
      .from(cfg.table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }


    workspace.innerHTML = `

      <div class="card">

        <div class="section-head">

          <div>

            <span class="tag">CMS</span>

            <h2>${esc(cfg.label)}</h2>

            <p class="muted">Manage published website content.</p>

          </div>

          <button class="btn primary" id="addRecord">
            + Add New
          </button>

        </div>

        <div id="cmsList">
          ${renderCmsRows(cfg, rows || [])}
        </div>

      </div>
    `;


    $('#addRecord').onclick = () => showCmsForm(key, null);

    workspace
      .querySelectorAll('[data-edit]')
      .forEach((b) => {

        b.onclick = () =>
          showCmsForm(
            key,
            JSON.parse(decodeURIComponent(b.dataset.edit))
          );
      });

    workspace
      .querySelectorAll('[data-delete]')
      .forEach((b) => {

        b.onclick = () => deleteCmsRecord(key, b.dataset.delete);
      });


  } catch (e) {

    workspace.innerHTML = `

      <div class="card">

        <h3>${esc(cfg.label)}</h3>

        <p class="muted">${esc(e.message)}</p>

        <p class="tiny">
          If this table does not exist yet, run the matching Supabase
          schema/policies before using this CMS section.
        </p>

      </div>
    `;
  }
}


/* =========================================================
   CMS ROWS
   ========================================================= */

function renderCmsRows(cfg, rows) {

  if (!rows.length) {

    return empty(
      `No records in ${cfg.label}. Click Add New to create one.`
    );
  }

  return `

    <div style="display:grid;gap:10px">

      ${rows
        .map((row) => {

          const title =
            row.title || row.name || row.exam || row.id;

          const status =
            row.published === false
              ? 'Draft / Unpublished'
              : (row.status === 'expired' ? 'Expired' : 'Published');

          const payload = encodeURIComponent(JSON.stringify(row));

          return `

            <div class="card" style="padding:14px">

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:10px;
                  flex-wrap:wrap
                "
              >

                <div>

                  <span class="tag">${esc(status)}</span>

                  <div class="job-title">${esc(title)}</div>

                  <p class="tiny">
                    ${esc(row.category || row.type || row.company || '')}
                  </p>

                </div>

                <div style="display:flex;gap:8px">

                  <button class="btn" data-edit="${payload}">
                    Edit
                  </button>

                  <button class="btn" data-delete="${esc(row.id)}">
                    Delete
                  </button>

                </div>

              </div>

            </div>
          `;
        })
        .join('')}

    </div>
  `;
}


/* =========================================================
   CMS FORM
   ========================================================= */

/* Format a stored timestamp for <input type="datetime-local"> (local time). */
function toLocalInput(v) {

  if (!v) {
    return '';
  }

  const d = new Date(v);

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const p = (n) => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}`;
}


function showCmsForm(key, row) {

  const cfg = ADMIN_TABLES[key];

  const modal = document.createElement('div');

  modal.id = 'cmsModal';

  modal.setAttribute('role', 'dialog');

  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.55);
    z-index:9999;
    overflow:auto;
    padding:24px
  `;


  const fieldHtml = ([name, label, type]) => {

    const val = row?.[name];

    if (type === 'textarea') {

      return `
        <label style="display:block;margin:10px 0">
          <b>${esc(label)}</b>
          <textarea
            class="search"
            rows="5"
            name="${esc(name)}"
          >${esc(val || '')}</textarea>
        </label>
      `;
    }

    if (type === 'checkbox') {

      /* New records: Published / Download enabled start ticked, Featured does not. */
      const checked =
        val === undefined || val === null
          ? name !== 'featured'
          : !!val;

      return `
        <label style="display:block;margin:14px 0">
          <input
            type="checkbox"
            name="${esc(name)}"
            ${checked ? 'checked' : ''}
          >
          ${esc(label)}
        </label>
      `;
    }

    const shown =
      type === 'datetime-local'
        ? toLocalInput(val)
        : (val ?? '');

    return `
      <label style="display:block;margin:10px 0">
        <b>${esc(label)}</b>
        <input
          class="search"
          type="${esc(type)}"
          name="${esc(name)}"
          value="${esc(shown)}"
        >
      </label>
    `;
  };


  modal.innerHTML = `

    <div class="card" style="max-width:760px;margin:40px auto">

      <div class="section-head">

        <div>

          <span class="tag">CMS</span>

          <h2>${row ? 'Edit' : 'Add'} ${esc(cfg.label)}</h2>

        </div>

        <button class="btn" id="closeCms">Close</button>

      </div>


      <form id="cmsForm">

        ${cfg.fields.map(fieldHtml).join('')}

        <div style="display:flex;gap:8px;margin-top:16px">

          <button class="btn primary" type="submit">Save</button>

          <button class="btn" type="button" id="cancelCms">
            Cancel
          </button>

        </div>

        <p id="cmsMsg" class="tiny"></p>

      </form>

    </div>
  `;


  document.body.appendChild(modal);

  const close = () => modal.remove();

  $('#closeCms').onclick = close;

  $('#cancelCms').onclick = close;


  $('#cmsForm').onsubmit = async (e) => {

    e.preventDefault();

    const msg = $('#cmsMsg');

    msg.textContent = 'Saving…';

    try {

      const { sb, state } = await requireAdmin();

      const payload = {};

      cfg.fields.forEach(([name, , type]) => {

        const el = e.target.elements[name];

        if (type === 'checkbox') {

          payload[name] = el.checked;

        } else if (type === 'date' || type === 'url') {

          payload[name] = el.value === '' ? null : el.value;

        } else if (type === 'datetime-local') {

          payload[name] =
            el.value === ''
              ? null
              : new Date(el.value).toISOString();

        } else {

          payload[name] = el.value;
        }
      });


      const save = (body) =>
        row?.id
          ? sb.from(cfg.table).update(body).eq('id', row.id)
          : sb.from(cfg.table).insert(body);


      let body = row?.id
        ? { ...payload, updated_at: new Date().toISOString() }
        : { ...payload, created_by: state.user.id };

      let { error } = await save(body);

      /* A few older tables have no updated_at column: retry without it. */
      if (error && /updated_at/i.test(error.message || '')) {

        delete body.updated_at;

        ({ error } = await save(body));
      }

      if (error) {
        throw error;
      }

      close();

      openAdminSection(key);

    } catch (err) {

      msg.textContent = err.message || 'Save failed.';
    }
  };
}


/* =========================================================
   DELETE CMS RECORD
   ========================================================= */

async function deleteCmsRecord(key, id) {

  if (!confirm('Delete this record? This cannot be undone.')) {
    return;
  }

  try {

    const { sb } = await requireAdmin();

    const { error } = await sb
      .from(ADMIN_TABLES[key].table)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    openAdminSection(key);

  } catch (e) {

    alert(e.message || 'Delete failed.');
  }
}


/* =========================================================
   GOOGLE DRIVE MANAGER
   ========================================================= */

async function manageDriveMappings() {

  const button = $('#manageDriveMappings');

  const panel = $('#driveMappingsPanel');

  try {

    if (button) {

      button.disabled = true;

      button.textContent = 'Connecting…';
    }

    const { sb } = await requireAdmin();

    const { data: result, error } =
      await sb.functions.invoke('drive-manager', { body: {} });

    if (error) {

      let msg = error.message || 'Drive manager request failed.';

      if (error.context) {

        try {

          const details = await error.context.json();

          msg = details.error || details.message || msg;

        } catch (_) {}
      }

      throw new Error(msg);
    }

    if (!result?.success) {

      throw new Error(result?.error || 'Drive connection failed.');
    }

    const folders = arr(result.folders);

    panel.style.display = 'block';

    panel.innerHTML =
      folders.length
        ? `

          <div class="tiny">Google Drive connection successful.</div>

          ${folders
            .map((f) => `

              <div class="card" style="padding:14px;margin-top:8px">

                <b>${esc(f.name)}</b>

                <div class="tiny">Folder ID: ${esc(f.id)}</div>

                ${
                  f.webViewLink
                    ? `
                      <a
                        class="btn"
                        style="display:inline-block;margin-top:8px"
                        href="${esc(safeUrl(f.webViewLink))}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Drive
                      </a>
                    `
                    : ''
                }

              </div>
            `)
            .join('')}
        `
        : `
          <div class="empty">
            Connected, but no CareerAxis Academy folder was found.
          </div>
        `;

  } catch (e) {

    alert(e.message || 'Unable to connect to Google Drive.');

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent = 'Manage mappings';
    }
  }
}


/* =========================================================
   MENU
   ========================================================= */

if ($('#menu')) {

  $('#menu').onclick = () => {

    const nav = $('#nav');

    nav.classList.toggle('open');

    $('#menu').setAttribute(
      'aria-expanded',
      String(nav.classList.contains('open'))
    );
  };
}


/* =========================================================
   LANGUAGE SWITCH
   ========================================================= */

if ($('#lang')) {

  $('#lang').textContent = lang === 'en' ? 'తెలుగు' : 'English';

  $('#lang').onclick = () => {

    lang = lang === 'en' ? 'te' : 'en';

    localStorage.setItem('careeraxis-lang', lang);

    $('#lang').textContent = lang === 'en' ? 'తెలుగు' : 'English';

    render();
  };
}


/* =========================================================
   EVENTS
   ========================================================= */

window.addEventListener('hashchange', render);


/* =========================================================
   START APPLICATION
   ========================================================= */

load();
