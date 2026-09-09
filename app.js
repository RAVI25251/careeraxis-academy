/* CareerAxis Academy - application layer
   Public information site + protected admin CMS UI.
   Secrets must remain server-side (Supabase Edge Functions / Google services).
*/

const C = window.CAREERAXIS_CONFIG || {};
let data = {
  jobs: [], resources: [], events: [], videos: [], careerPaths: [],
  education: [], exams: [], results: [], papers: [], guides: [],
  officialLinks: [], announcements: []
};
let lang = localStorage.getItem('careeraxis-lang') || 'en';
let sbPromise = null;

const $ = (s) => document.querySelector(s);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#039;'
}[m]));

const arr = (v) => Array.isArray(v) ? v : [];

const safeUrl = (url) => {
  try {
    const u = new URL(String(url || ''), location.origin);

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
   SUPABASE
   ========================================================= */

async function getSupabase() {

  /*
    Reuse the authentication module's Supabase client when
    available. This is important because it preserves the
    existing Google login session.
  */

  if (window.CareerAxisAuth?.getSupabase) {

    const client = window.CareerAxisAuth.getSupabase();

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

      await new Promise((resolve, reject) => {

        const existing =
          document.querySelector(
            'script[data-careeraxis-supabase]'
          );

        if (existing) {

          const timer = setInterval(() => {

            if (window.supabase?.createClient) {

              clearInterval(timer);

              resolve();
            }

          }, 50);

          setTimeout(() => {

            clearInterval(timer);

            reject(
              new Error(
                'Supabase library timeout'
              )
            );

          }, 10000);

          return;
        }

        const s = document.createElement('script');

        s.src =
          'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

        s.async = true;

        s.dataset.careeraxisSupabase = 'true';

        s.onload = resolve;

        s.onerror = () =>
          reject(
            new Error(
              'Unable to load Supabase library'
            )
          );

        document.head.appendChild(s);
      });
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

  const {
    data: rows,
    error
  } = await sb
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

    const r = await fetch(
      'data/content.json',
      {
        cache: 'no-store'
      }
    );

    if (r.ok) {
      local = await r.json();
    }

  } catch (_) {}


  data = {

    jobs:
      arr(local.jobs),

    resources:
      arr(local.resources),

    events:
      arr(local.events),

    videos:
      arr(local.videos),

    careerPaths:
      arr(local.careerPaths),

    education:
      arr(
        local.education ||
        local.educationUpdates
      ),

    exams:
      arr(
        local.exams ||
        local.examUpdates
      ),

    results:
      arr(local.results),

    papers:
      arr(
        local.papers ||
        local.previousPapers
      ),

    guides:
      arr(
        local.guides ||
        local.careerGuides
      ),

    officialLinks:
      arr(local.officialLinks),

    announcements:
      arr(local.announcements)

  };


  /*
    Supabase database content is optional for public browsing.
    When available, published database records are used.
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

    tableMap.map(
      async ([key, table]) => {

        const rows =
          await readTable(table);

        if (rows.length) {

          data[key] =
            rows.filter(
              (x) =>
                x.published === undefined ||
                x.published === true
            );

        }

      }
    )

  );


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

      const k =
        a.dataset.social;

      const u =
        safeUrl(
          C.social?.[k] || '#'
        );

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


function render() {

  const params =
    new URLSearchParams(
      location.search
    );

  const route =
    params.get('admin') === 'secure'
      ? 'admin'
      : (
          location.hash.slice(1) ||
          'home'
        );


  if (
    route === C.adminRoute ||
    route === 'admin'
  ) {

    admin();

    return;
  }


  const pages = {

    home,

    jobs,

    careers,

    education,

    exams,

    results,

    papers,

    resources,

    calendar,

    youtube,

    community,

    about,

    contact

  };


  (
    pages[route] ||
    home
  )();


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });


  bindSocial();
}


/* =========================================================
   COMMON UI
   ========================================================= */

function pageShell(
  title,
  subtitle,
  body
) {

  return `
    <section class="section">

      <div class="section-head">

        <div>

          <h1>
            ${esc(title)}
          </h1>

          <p class="muted">
            ${esc(subtitle)}
          </p>

        </div>

      </div>

      ${body}

    </section>
  `;
}


function empty(msg) {

  return `
    <div
      class="empty"
      style="grid-column:1/-1"
    >
      ${esc(msg)}
    </div>
  `;
}


/* =========================================================
   JOB CARD
   ========================================================= */

function jobCard(j) {

  const url =
    safeUrl(
      j.applyUrl ||
      j.apply_url ||
      j.official_link ||
      j.url
    );


  return `
    <article class="card">

      <span class="tag">
        ${esc(
          j.category ||
          j.job_category ||
          'Job'
        )}
      </span>

      <div class="job-title">
        ${esc(
          j.title ||
          j.name
        )}
      </div>

      <b>
        ${esc(
          j.company ||
          j.organization ||
          ''
        )}
      </b>

      <p class="muted">
        ${esc(
          j.location ||
          'India'
        )}
        ·
        ${esc(
          j.qualification ||
          j.eligibility ||
          'Check official notice'
        )}
      </p>

      <p>
        <b>Last date:</b>
        ${esc(
          j.lastDate ||
          j.last_date ||
          'Check official notice'
        )}
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
              Apply / Official Link
            </a>
          `
          : ''
      }

    </article>
  `;
}


/* =========================================================
   YOUTUBE CARD
   ========================================================= */

function videoCard(v) {

  const url =
    safeUrl(
      v.url ||
      v.video_url ||
      v.youtube_url
    );


  const thumb =
    v.thumbnail ||
    v.thumbnail_url ||
    '';


  return `
    <article class="card video-card">

      ${
        thumb
          ? `
            <img
              src="${esc(
                safeUrl(thumb)
              )}"
              alt=""
              loading="lazy"
              style="
                width:100%;
                border-radius:12px
              "
            >
          `
          : `
            <div class="thumb">
              ▶
            </div>
          `
      }

      <div class="body">

        <span class="tag">
          YouTube
        </span>

        <div class="job-title">
          ${esc(
            v.title ||
            v.name
          )}
        </div>

        <p class="muted">

          ${esc(
            v.category ||
            ''
          )}

          ${
            v.published_at ||
            v.publishedAt
              ? ' · ' +
                esc(
                  fmtDate(
                    v.published_at ||
                    v.publishedAt
                  )
                )
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

  const url =
    safeUrl(
      r.driveUrl ||
      r.drive_url ||
      r.url ||
      r.official_link
    );


  return `
    <article class="card">

      <span class="tag">
        ${esc(
          r.category ||
          r.company ||
          'Resource'
        )}
      </span>

      <div class="job-title">
        ${esc(
          r.title ||
          r.name
        )}
      </div>

      <p class="muted">
        ${esc(
          r.description ||
          'Free preparation resource'
        )}
      </p>

      ${
        r.file_type
          ? `
            <p class="tiny">
              File:
              ${esc(r.file_type)}
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

function socialCard(
  name,
  desc,
  key,
  icon
) {

  const url =
    safeUrl(
      C.social?.[key] ||
      '#'
    );


  return `
    <a
      class="social"
      href="${esc(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >

      <div
        style="font-size:26px"
      >
        ${icon}
      </div>

      <b>
        ${esc(name)}
      </b>

      <span class="muted">
        ${esc(desc)}
      </span>

    </a>
  `;
}


/* =========================================================
   HOME PAGE
   ========================================================= */

function home() {

  const featured =
    data.jobs
      .filter(
        x => x.featured
      )
      .slice(0, 3);


  const jobsList =
    featured.length
      ? featured
      : data.jobs.slice(0, 3);


  const vids =
    data.videos.slice(0, 3);


  const res =
    data.resources.slice(0, 4);


  const edu =
    data.education.slice(0, 3);


  const ann =
    data.announcements.slice(0, 3);


  $('#app').innerHTML = `

    <section class="hero">

      <div class="hero-inner">

        <div>

          <div class="tag">
            FREE CAREER & JOB INFORMATION
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

          <div class="actions">

            <a
              class="btn primary"
              href="#jobs"
            >
              Explore Jobs
            </a>

            <a
              class="btn secondary"
              href="#careers"
            >
              Explore Career Paths
            </a>

          </div>

        </div>


        <div class="hero-card">

          <img
            src="assets/careeraxis-logo.png"
            alt="CareerAxis Academy logo"
          >

          <p
            style="
              text-align:center;
              margin:14px 0 0
            "
          >
            CareerAxis Academy
          </p>

        </div>

      </div>

    </section>


    ${sectionBlock(
      'Latest Jobs',
      'Current opportunities and official application links',
      jobsList.map(jobCard).join('') ||
      empty('No published jobs yet.')
    )}


    ${sectionBlock(
      'Education Updates',
      'Admissions, notifications, counselling and important education information',
      edu.map(infoCard).join('') ||
      empty('No education updates yet.')
    )}


    ${sectionBlock(
      'Latest YouTube',
      'Job updates and practical career guidance',
      vids.map(videoCard).join('') ||
      empty('No videos published yet.')
    )}


    ${sectionBlock(
      'Latest Announcements',
      'Important CareerAxis Academy announcements',
      ann.map(infoCard).join('') ||
      empty('No announcements yet.')
    )}


    ${sectionBlock(
      'Free Resources',
      'Preparation resources and previous papers',
      res.map(resourceCard).join('') ||
      empty('No resources published yet.')
    )}


    <section class="section community">

      <div class="section-head">

        <div>

          <h2>
            Join CareerAxis Academy Community
          </h2>

          <p class="muted">
            Stay updated across official social channels.
          </p>

        </div>

      </div>


      <div class="socials">

        ${socialCard(
          'YouTube',
          'Subscribe for job and career updates',
          'youtube',
          '▶'
        )}

        ${socialCard(
          'Telegram',
          'Join the latest update channel',
          'telegram',
          '✈'
        )}

        ${socialCard(
          'WhatsApp',
          'Join the community',
          'whatsapp',
          '◉'
        )}

        ${socialCard(
          'Instagram',
          'Follow CareerAxis Academy',
          'instagram',
          '◎'
        )}

      </div>

    </section>

  `;
}


/* =========================================================
   SECTION BLOCK
   ========================================================= */

function sectionBlock(
  title,
  subtitle,
  cards
) {

  return `

    <section class="section">

      <div class="section-head">

        <div>

          <h2>
            ${esc(title)}
          </h2>

          <p class="muted">
            ${esc(subtitle)}
          </p>

        </div>

      </div>

      <div class="grid">

        ${cards}

      </div>

    </section>

  `;
}


/* =========================================================
   INFORMATION CARD
   ========================================================= */

function infoCard(x) {

  const url =
    safeUrl(
      x.official_link ||
      x.officialLink ||
      x.url ||
      x.result_url
    );


  return `

    <article class="card">

      <span class="tag">
        ${esc(
          x.category ||
          x.type ||
          'Update'
        )}
      </span>

      <div class="job-title">
        ${esc(
          x.title ||
          x.exam ||
          x.name
        )}
      </div>

      <p class="muted">
        ${esc(
          x.description ||
          x.status ||
          x.result_status ||
          ''
        )}
      </p>

      ${
        x.date ||
        x.result_date
          ? `
            <p>
              <b>Date:</b>
              ${esc(
                fmtDate(
                  x.date ||
                  x.result_date
                )
              )}
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
   JOBS PAGE
   ========================================================= */

function jobs() {

  $('#app').innerHTML =
    pageShell(
      'Latest Jobs',
      'Search current opportunities. Always verify details on the official employer page.',

      `

        <input
          class="search"
          id="jobSearch"
          placeholder="Search company, job title, category or qualification..."
        >

        <div
          class="grid"
          id="jobGrid"
          style="margin-top:18px"
        >

          ${
            data.jobs
              .map(jobCard)
              .join('') ||
            empty(
              'No published jobs yet.'
            )
          }

        </div>

      `
    );


  $('#jobSearch').oninput =
    e => {

      const q =
        e.target.value.toLowerCase();


      $('#jobGrid').innerHTML =
        data.jobs
          .filter(
            j =>
              JSON.stringify(j)
                .toLowerCase()
                .includes(q)
          )
          .map(jobCard)
          .join('') ||

        empty(
          'No matching jobs.'
        );
    };
}


/* =========================================================
   CAREER PATHS
   ========================================================= */

function careers() {

  const paths =
    data.careerPaths.length

      ? data.careerPaths

      : [

          'Career After 10th',

          'Career After 12th',

          'MPC',

          'Bi.P.C',

          'MEC',

          'CEC',

          'B.Tech',

          'IT Careers',

          'Medical Careers',

          'MBBS',

          'Engineering',

          'Government Careers'

        ];


  $('#app').innerHTML =

    pageShell(
      'Career Paths',
      'Simple guidance from school to professional careers.',

      `

        <div class="grid">

          ${
            paths
              .map(
                x =>

                  typeof x === 'string'

                    ? `

                      <article class="card">

                        <span class="tag">
                          Career Path
                        </span>

                        <div class="job-title">
                          ${esc(x)}
                        </div>

                        <p class="muted">
                          Guidance, exams, skills, jobs and free resources will be published here.
                        </p>

                      </article>

                    `

                    : infoCard(x)
              )
              .join('')
          }

        </div>

      `
    );
}


/* =========================================================
   EDUCATION
   ========================================================= */

function education() {

  $('#app').innerHTML =

    pageShell(
      'Education Updates',
      'Intermediate, MPC, Bi.P.C, admissions, scholarships and education notifications.',

      `

        <div class="grid">

          ${
            data.education
              .map(infoCard)
              .join('') ||

            empty(
              'No education updates yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   EXAMS
   ========================================================= */

function exams() {

  $('#app').innerHTML =

    pageShell(
      'Exam Updates',
      'Notifications, application dates, hall tickets, exams, answer keys and counselling.',

      `

        <div class="grid">

          ${
            data.exams
              .map(infoCard)
              .join('') ||

            empty(
              'No exam updates yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   RESULTS
   ========================================================= */

function results() {

  $('#app').innerHTML =

    pageShell(
      'Results',
      'Redirect to official result pages. CareerAxis Academy does not recreate official result systems.',

      `

        <div class="grid">

          ${
            data.results
              .map(infoCard)
              .join('') ||

            empty(
              'No result updates yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   PREVIOUS PAPERS
   ========================================================= */

function papers() {

  $('#app').innerHTML =

    pageShell(
      'Previous Papers',
      'Legally shareable previous papers and preparation materials.',

      `

        <div class="grid">

          ${
            data.papers
              .map(resourceCard)
              .join('') ||

            empty(
              'No previous papers published yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   RESOURCES
   ========================================================= */

function resources() {

  $('#app').innerHTML =

    pageShell(
      'Free Resources',
      'Organized by company, exam and career path.',

      `

        <div class="grid">

          ${
            data.resources
              .map(resourceCard)
              .join('') ||

            empty(
              'No resources published yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   CALENDAR
   ========================================================= */

function calendar() {

  const events =
    [...data.events]
      .sort(
        (a, b) =>
          String(a.date || '')
            .localeCompare(
              String(b.date || '')
            )
      );


  $('#app').innerHTML =

    pageShell(
      'Job & Exam Calendar',
      'Deadlines, exams, result dates and important career events.',

      `

        <div class="grid">

          ${
            events
              .map(
                e => `

                  <article class="card">

                    <span class="tag">
                      ${esc(
                        e.type ||
                        'Event'
                      )}
                    </span>

                    <div class="job-title">
                      ${esc(
                        e.title ||
                        e.name
                      )}
                    </div>

                    <b>
                      ${esc(
                        fmtDate(
                          e.date
                        )
                      )}
                    </b>

                    <p class="muted">
                      ${esc(
                        e.description ||
                        ''
                      )}
                    </p>

                    ${
                      safeUrl(
                        e.official_link ||
                        e.url
                      ) !== '#'

                        ? `

                          <a
                            class="btn primary"
                            href="${esc(
                              safeUrl(
                                e.official_link ||
                                e.url
                              )
                            )}"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Official Source
                          </a>

                        `

                        : ''
                    }

                  </article>

                `
              )
              .join('') ||

            empty(
              'No upcoming events.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   YOUTUBE
   ========================================================= */

function youtube() {

  const channel =
    safeUrl(
      C.youtubeChannelUrl ||
      C.social?.youtube ||
      '#'
    );


  $('#app').innerHTML =

    pageShell(
      'CareerAxis Academy on YouTube',
      'Job notifications, preparation and career guidance.',

      `

        <div
          style="margin-bottom:18px"
        >

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
            data.videos
              .map(videoCard)
              .join('') ||

            empty(
              'No videos published yet.'
            )
          }

        </div>

      `
    );
}


/* =========================================================
   COMMUNITY
   ========================================================= */

function community() {

  $('#app').innerHTML =

    pageShell(
      'Join the Community',
      'Official CareerAxis Academy social links.',

      `

        <div class="socials">

          ${socialCard(
            'YouTube',
            'Subscribe',
            'youtube',
            '▶'
          )}

          ${socialCard(
            'Telegram',
            'Join channel',
            'telegram',
            '✈'
          )}

          ${socialCard(
            'WhatsApp',
            'Join community',
            'whatsapp',
            '◉'
          )}

          ${socialCard(
            'Instagram',
            'Follow',
            'instagram',
            '◎'
          )}

        </div>

      `
    );
}


/* =========================================================
   ABOUT
   ========================================================= */

function about() {

  $('#app').innerHTML =

    pageShell(
      'About CareerAxis Academy',
      'A free career and education information platform.',

      `

        <div class="card">

          <h2>
            Knowledge to Success
          </h2>

          <p>
            CareerAxis Academy organizes job information, career guidance, education updates, exam updates, results, previous papers, free resources and practical YouTube content.
          </p>

          <p class="muted">
            CareerAxis Academy is an information platform and is not an official government, university or examination authority.
          </p>

        </div>

      `
    );
}


/* =========================================================
   CONTACT
   ========================================================= */

function contact() {

  $('#app').innerHTML =

    pageShell(
      'Contact Us',
      'We would be happy to hear from you.',

      `

        <div class="card">

          <h2>
            CareerAxis Academy
          </h2>

          <p>
            Email:
            <a href="mailto:careeraxisacademy@gmail.com">
              careeraxisacademy@gmail.com
            </a>
          </p>

          <p class="muted">
            For official information, always verify details with the relevant government, university, examination authority or employer.
          </p>

        </div>

      `
    );
}


/* =========================================================
   ADMIN TABLE CONFIGURATION
   ========================================================= */

const ADMIN_TABLES = {

  jobs: {

    label: 'Jobs',

    table: 'jobs',

    fields: [

      ['title',
       'Title',
       'text'],

      ['company',
       'Company / Organization',
       'text'],

      ['category',
       'Category',
       'text'],

      ['location',
       'Location',
       'text'],

      ['qualification',
       'Eligibility / Qualification',
       'text'],

      ['last_date',
       'Last Date',
       'date'],

      ['apply_url',
       'Official Apply URL',
       'url'],

      ['featured',
       'Featured',
       'checkbox'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  education: {

    label:
      'Education Updates',

    table:
      'education_updates',

    fields: [

      ['title',
       'Title',
       'text'],

      ['category',
       'Category',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['date',
       'Date',
       'date'],

      ['official_link',
       'Official Link',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  exams: {

    label:
      'Exam Updates',

    table:
      'exams',

    fields: [

      ['title',
       'Exam / Update',
       'text'],

      ['category',
       'Category',
       'text'],

      ['status',
       'Status',
       'text'],

      ['date',
       'Important Date',
       'date'],

      ['official_link',
       'Official Link',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  results: {

    label:
      'Results',

    table:
      'exam_results',

    fields: [

      ['exam',
       'Exam',
       'text'],

      ['result_status',
       'Result Status',
       'text'],

      ['result_date',
       'Result Date',
       'date'],

      ['official_link',
       'Official Result Link',
       'url'],

      ['official_source',
       'Official Source',
       'text'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  events: {

    label:
      'Calendar',

    table:
      'calendar_events',

    fields: [

      ['title',
       'Event Title',
       'text'],

      ['type',
       'Event Type',
       'text'],

      ['date',
       'Date',
       'date'],

      ['description',
       'Description',
       'textarea'],

      ['official_link',
       'Official Link',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  careers: {

    label:
      'Career Paths',

    table:
      'career_paths',

    fields: [

      ['title',
       'Career Path Title',
       'text'],

      ['category',
       'Category',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['official_link',
       'Official Link',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  guides: {

    label:
      'Career Guides',

    table:
      'career_guides',

    fields: [

      ['title',
       'Guide Title',
       'text'],

      ['category',
       'Category',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['content',
       'Guide Content',
       'textarea'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  papers: {

    label:
      'Previous Papers',

    table:
      'previous_papers',

    fields: [

      ['title',
       'Title',
       'text'],

      ['year',
       'Year',
       'text'],

      ['subject',
       'Subject',
       'text'],

      ['category',
       'Category',
       'text'],

      ['language',
       'Language',
       'text'],

      ['file_type',
       'File Type',
       'text'],

      ['drive_url',
       'Drive URL',
       'url'],

      ['official_source',
       'Official Source',
       'text'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  resources: {

    label:
      'Resources',

    table:
      'resources',

    fields: [

      ['title',
       'Title',
       'text'],

      ['category',
       'Category',
       'text'],

      ['company',
       'Company / Exam',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['drive_url',
       'Drive URL',
       'url'],

      ['drive_file_id',
       'Drive File ID',
       'text'],

      ['published',
       'Published',
       'checkbox'],

      ['download_enabled',
       'Download Enabled',
       'checkbox']

    ]

  },


  videos: {

    label:
      'YouTube Videos',

    table:
      'youtube_videos',

    fields: [

      ['title',
       'Title',
       'text'],

      ['category',
       'Category',
       'text'],

      ['url',
       'YouTube URL',
       'url'],

      ['thumbnail_url',
       'Thumbnail URL',
       'url'],

      ['published_at',
       'Published At',
       'datetime-local'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  officialLinks: {

    label:
      'Official Links',

    table:
      'official_links',

    fields: [

      ['title',
       'Name',
       'text'],

      ['category',
       'Category',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['url',
       'Official URL',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  },


  announcements: {

    label:
      'Announcements',

    table:
      'announcements',

    fields: [

      ['title',
       'Title',
       'text'],

      ['description',
       'Description',
       'textarea'],

      ['url',
       'Link',
       'url'],

      ['published',
       'Published',
       'checkbox']

    ]

  }

};


/* =========================================================
   REQUIRE ADMIN
   ========================================================= */

async function requireAdmin() {

  const auth =
    window.CareerAxisAuth;


  if (!auth) {

    throw new Error(
      'Authentication module unavailable.'
    );

  }


  const state =
    await auth.initAdminAuth();


  if (!state.configured) {

    throw new Error(
      'Supabase authentication is not configured.'
    );

  }


  if (!state.user) {

    throw new Error(
      'Please sign in with Google.'
    );

  }


  if (!state.authorized) {

    throw new Error(
      'Access denied for this Google account.'
    );

  }


  if (
    !auth.hasRecentOtpVerification()
  ) {

    throw new Error(
      'Admin OTP verification is required.'
    );

  }


  return {

    auth,

    state,

    sb:
      await getSupabase()

  };

}


/* =========================================================
   ADMIN MAIN
   ========================================================= */

async function admin() {

  document.title =
    'CareerAxis Academy — Secure Admin';


  const auth =
    window.CareerAxisAuth;


  if (!auth) {

    $('#app').innerHTML =
      pageShell(
        'Admin',
        '',
        empty(
          'Authentication module unavailable.'
        )
      );

    return;
  }


  let state;


  try {

    state =
      await auth.initAdminAuth();

  } catch (e) {

    $('#app').innerHTML =
      pageShell(
        'Admin',
        '',
        `<div class="empty">
          ${esc(e.message)}
        </div>`
      );

    return;
  }


  if (!state.configured) {

    $('#app').innerHTML =
      pageShell(
        'Secure Admin',
        '',

        `

          <div class="admin-box">

            <h2>
              Supabase is not configured
            </h2>

            <p>
              Configure site-config.js first.
            </p>

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

            <button
              class="btn primary"
              id="googleAdmin"
            >
              Continue with Google
            </button>

            <p class="tiny">
              Only the two authorized CareerAxis Academy accounts can continue.
            </p>

          </div>

        `
      );


    $('#googleAdmin').onclick =
      async () => {

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

            ${esc(
              state.user.email
            )}

            is not authorized.

          </div>

        `
      );

    return;
  }


  if (
    !auth.hasRecentOtpVerification()
  ) {

    renderOtpGate(
      auth,
      state
    );

    return;
  }


  renderAdminHome(state);
}


/* =========================================================
   ADMIN OTP
   ========================================================= */

function renderOtpGate(
  auth,
  state
) {

  $('#app').innerHTML =

    pageShell(
      'Verify Admin OTP',
      'Second factor required',

      `

        <div class="admin-box">

          <p>
            Google authentication succeeded for
            <b>
              ${esc(
                state.user.email
              )}
            </b>.
          </p>

          <p>
            OTP destination:
            <b>
              ${esc(
                C.otpDestinationLabel ||
                'protected mailbox'
              )}
            </b>
          </p>


          <button
            class="btn primary"
            id="sendOtp"
          >
            Send OTP
          </button>


          <div
            id="otpForm"
            style="
              display:none;
              margin-top:18px
            "
          >

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


          <p
            id="otpMsg"
            class="tiny"
          ></p>


          <button
            class="btn"
            id="logoutAdmin"
          >
            Sign out
          </button>

        </div>

      `
    );


  $('#sendOtp').onclick =
    async () => {

      const b =
        $('#sendOtp');

      b.disabled = true;

      try {

        await auth.requestAdminOtp();

        $('#otpForm')
          .style.display =
          'block';

        $('#otpMsg')
          .textContent =
          'OTP sent. It expires quickly and can be used once.';

      } catch (e) {

        $('#otpMsg')
          .textContent =
          e.message;

        b.disabled = false;
      }

    };


  $('#verifyOtp').onclick =
    async () => {

      const code =
        $('#otpCode')
          .value
          .trim();


      if (
        !/^\d{6}$/.test(code)
      ) {

        alert(
          'Enter the 6-digit OTP.'
        );

        return;
      }


      try {

        await auth.verifyAdminOtp(
          code
        );

        render();

      } catch (e) {

        alert(
          e.message
        );

      }

    };


  $('#logoutAdmin').onclick =
    auth.signOutAdmin;
}


/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

function renderAdminHome(
  state
) {

  const items =
    Object.entries(
      ADMIN_TABLES
    )
      .map(
        ([key, cfg]) =>

          `

            <button
              class="btn"
              data-admin-section="${esc(key)}"
            >
              ${esc(cfg.label)}
            </button>

          `
      )
      .join('');


  $('#app').innerHTML = `

    <section class="section">

      <div class="section-head">

        <div>

          <span class="tag">
            ADMIN
          </span>

          <h1>
            CareerAxis Academy Control Center
          </h1>

          <p class="muted">
            Signed in as
            ${esc(
              state.user.email
            )}
            · OTP verified.
          </p>

        </div>


        <button
          class="btn"
          id="logoutAdmin"
        >
          Sign out
        </button>

      </div>


      <div
        class="card"
        style="margin-bottom:18px"
      >

        <h3>
          Content Management
        </h3>

        <p class="muted">
          Add, edit, publish and unpublish website information without editing HTML.
        </p>


        <div
          style="
            display:flex;
            flex-wrap:wrap;
            gap:8px
          "
        >

          ${items}

        </div>

      </div>


      <div class="grid">


        <div class="card">

          <span class="tag">
            Google Drive
          </span>

          <div class="job-title">
            Folder Mapping
          </div>

          <p class="muted">
            Connected through the protected drive-manager Edge Function.
          </p>


          <button
            class="btn primary"
            id="manageDriveMappings"
          >
            Manage mappings
          </button>


          <div
            id="driveMappingsPanel"
            style="
              display:none;
              margin-top:16px
            "
          ></div>

        </div>


        <div class="card">

          <span class="tag">
            YouTube
          </span>

          <div class="job-title">
            Channel Integration
          </div>

          <p class="muted">
            Channel:
            ${esc(
              C.youtubeChannelId ||
              'Not configured'
            )}
          </p>


          <button
            class="btn primary"
            data-admin-section="videos"
          >
            Manage videos
          </button>

        </div>


        <div class="card">

          <span class="tag">
            Security
          </span>

          <div class="job-title">
            2 Admin Accounts + OTP
          </div>

          <p class="muted">
            Google OAuth + server-side OTP verification.
          </p>

        </div>


        <div class="card">

          <span class="tag">
            Automation
          </span>

          <div class="job-title">
            Sync Center
          </div>

          <p class="muted">
            Automation runs through configured backend/GitHub Actions workflows.
          </p>

          <p class="tiny">
            No secrets are stored in app.js.
          </p>

        </div>


      </div>


      <div
        id="adminWorkspace"
        style="margin-top:18px"
      ></div>


    </section>

  `;


  $('#logoutAdmin').onclick =
    window.CareerAxisAuth
      .signOutAdmin;


  $('#manageDriveMappings').onclick =
    manageDriveMappings;


  document
    .querySelectorAll(
      '[data-admin-section]'
    )
    .forEach(
      b =>

        b.onclick =
          () =>
            openAdminSection(
              b.dataset.adminSection
            )
    );
}


/* =========================================================
   OPEN ADMIN CONTENT SECTION
   ========================================================= */

async function openAdminSection(
  key
) {

  const cfg =
    ADMIN_TABLES[key];


  if (!cfg) {
    return;
  }


  const workspace =
    $('#adminWorkspace');


  if (!workspace) {
    return;
  }


  workspace.innerHTML = `

    <div class="card">

      <p class="muted">
        Loading
        ${esc(cfg.label)}
        …
      </p>

    </div>

  `;


  try {

    const {
      sb
    } =
      await requireAdmin();


    if (!sb) {

      throw new Error(
        'Supabase client unavailable.'
      );

    }


    const {
      data: rows,
      error
    } =
      await sb
        .from(cfg.table)
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    workspace.innerHTML = `

      <div class="card">

        <div class="section-head">

          <div>

            <span class="tag">
              CMS
            </span>

            <h2>
              ${esc(cfg.label)}
            </h2>

            <p class="muted">
              Manage published website content.
            </p>

          </div>


          <button
            class="btn primary"
            id="addRecord"
          >
            + Add New
          </button>

        </div>


        <div id="cmsList">

          ${renderCmsRows(
            cfg,
            rows || []
          )}

        </div>

      </div>

    `;


    $('#addRecord').onclick =
      () =>
        showCmsForm(
          key,
          null
        );


    workspace
      .querySelectorAll(
        '[data-edit]'
      )
      .forEach(
        b =>

          b.onclick =
            () =>
              showCmsForm(
                key,
                JSON.parse(
                  decodeURIComponent(
                    b.dataset.edit
                  )
                )
              )
      );


    workspace
      .querySelectorAll(
        '[data-delete]'
      )
      .forEach(
        b =>

          b.onclick =
            () =>
              deleteCmsRecord(
                key,
                b.dataset.delete
              )
      );


  } catch (e) {

    workspace.innerHTML = `

      <div class="card">

        <h3>
          ${esc(cfg.label)}
        </h3>

        <p class="muted">
          ${esc(e.message)}
        </p>

        <p class="tiny">
          If this table does not exist yet, run the matching Supabase schema/policies before using this CMS section.
        </p>

      </div>

    `;

  }

}


/* =========================================================
   CMS ROWS
   ========================================================= */

function renderCmsRows(
  cfg,
  rows
) {

  if (!rows.length) {

    return empty(
      `No records in ${cfg.label}. Click Add New to create one.`
    );

  }


  return `

    <div
      style="
        display:grid;
        gap:10px
      "
    >

      ${rows
        .map(
          row => {

            const title =
              row.title ||
              row.name ||
              row.exam ||
              row.id;


            const status =
              row.published === false
                ? 'Draft / Unpublished'
                : 'Published';


            const payload =
              encodeURIComponent(
                JSON.stringify(row)
              );


            return `

              <div
                class="card"
                style="padding:14px"
              >

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:10px;
                    flex-wrap:wrap
                  "
                >

                  <div>

                    <span class="tag">
                      ${esc(status)}
                    </span>

                    <div class="job-title">
                      ${esc(title)}
                    </div>

                    <p class="tiny">
                      ${esc(
                        row.category ||
                        row.type ||
                        row.company ||
                        ''
                      )}
                    </p>

                  </div>


                  <div
                    style="
                      display:flex;
                      gap:8px
                    "
                  >

                    <button
                      class="btn"
                      data-edit="${payload}"
                    >
                      Edit
                    </button>


                    <button
                      class="btn"
                      data-delete="${esc(row.id)}"
                    >
                      Delete
                    </button>

                  </div>

                </div>

              </div>

            `;

          }
        )
        .join('')}

    </div>

  `;

}


/* =========================================================
   CMS FORM
   ========================================================= */

function showCmsForm(
  key,
  row
) {

  const cfg =
    ADMIN_TABLES[key];


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'cmsModal';


  modal.style.cssText =
    `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.55);
      z-index:9999;
      overflow:auto;
      padding:24px
    `;


  modal.innerHTML = `

    <div
      class="card"
      style="
        max-width:760px;
        margin:40px auto
      "
    >

      <div class="section-head">

        <div>

          <span class="tag">
            CMS
          </span>

          <h2>
            ${
              row
                ? 'Edit'
                : 'Add'
            }

            ${esc(cfg.label)}

          </h2>

        </div>


        <button
          class="btn"
          id="closeCms"
        >
          Close
        </button>

      </div>


      <form id="cmsForm">

        ${cfg.fields
          .map(
            ([name, label, type]) => {

              const val =
                row?.[name];


              if (
                type ===
                'textarea'
              ) {

                return `

                  <label
                    style="
                      display:block;
                      margin:10px 0
                    "
                  >

                    <b>
                      ${esc(label)}
                    </b>

                    <textarea
                      class="search"
                      rows="5"
                      name="${esc(name)}"
                    >${esc(val || '')}</textarea>

                  </label>

                `;

              }


              if (
                type ===
                'checkbox'
              ) {

                return `

                  <label
                    style="
                      display:block;
                      margin:14px 0
                    "
                  >

                    <input
                      type="checkbox"
                      name="${esc(name)}"

                      ${
                        val === undefined
                          ? 'checked'
                          : val
                            ? 'checked'
                            : ''
                      }
                    >

                    ${esc(label)}

                  </label>

                `;

              }


              return `

                <label
                  style="
                    display:block;
                    margin:10px 0
                  "
                >

                  <b>
                    ${esc(label)}
                  </b>

                  <input
                    class="search"
                    type="${esc(type)}"
                    name="${esc(name)}"
                    value="${esc(val ?? '')}"
                  >

                </label>

              `;

            }
          )
          .join('')}


        <div
          style="
            display:flex;
            gap:8px;
            margin-top:16px
          "
        >

          <button
            class="btn primary"
            type="submit"
          >
            Save
          </button>


          <button
            class="btn"
            type="button"
            id="cancelCms"
          >
            Cancel
          </button>

        </div>


        <p
          id="cmsMsg"
          class="tiny"
        ></p>

      </form>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  const close =
    () => modal.remove();


  $('#closeCms').onclick =
    close;


  $('#cancelCms').onclick =
    close;


  $('#cmsForm').onsubmit =
    async (e) => {

      e.preventDefault();


      const msg =
        $('#cmsMsg');


      msg.textContent =
        'Saving…';


      try {

        const {
          sb,
          state
        } =
          await requireAdmin();


        const payload =
          {};


        cfg.fields
          .forEach(
            ([name]) => {

              const el =
                e.target.elements[name];


              payload[name] =
                el.type ===
                'checkbox'

                  ? el.checked

                  : el.value;

            }
          );


        if (
          payload.published ===
          ''
        ) {

          payload.published =
            true;

        }


        if (row?.id) {

          payload.updated_at =
            new Date()
              .toISOString();


          const {
            error
          } =
            await sb
              .from(cfg.table)
              .update(payload)
              .eq(
                'id',
                row.id
              );


          if (error) {
            throw error;
          }

        } else {

          payload.created_by =
            state.user.id;


          const {
            error
          } =
            await sb
              .from(cfg.table)
              .insert(payload);


          if (error) {
            throw error;
          }

        }


        close();


        openAdminSection(
          key
        );


      } catch (err) {

        msg.textContent =
          err.message ||
          'Save failed.';

      }

    };

}


/* =========================================================
   DELETE CMS RECORD
   ========================================================= */

async function deleteCmsRecord(
  key,
  id
) {

  if (
    !confirm(
      'Delete this record? This cannot be undone.'
    )
  ) {

    return;

  }


  try {

    const {
      sb
    } =
      await requireAdmin();


    const {
      error
    } =
      await sb
        .from(
          ADMIN_TABLES[key].table
        )
        .delete()
        .eq(
          'id',
          id
        );


    if (error) {
      throw error;
    }


    openAdminSection(
      key
    );


  } catch (e) {

    alert(
      e.message ||
      'Delete failed.'
    );

  }

}


/* =========================================================
   GOOGLE DRIVE MANAGER
   ========================================================= */

async function manageDriveMappings() {

  const button =
    $('#manageDriveMappings');


  const panel =
    $('#driveMappingsPanel');


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Connecting…';

    }


    const {
      sb
    } =
      await requireAdmin();


    const {
      data: result,
      error
    } =
      await sb.functions.invoke(
        'drive-manager',
        {
          body: {}
        }
      );


    if (error) {

      let msg =
        error.message ||
        'Drive manager request failed.';


      if (error.context) {

        try {

          const details =
            await error.context.json();


          msg =
            details.error ||
            details.message ||
            msg;

        } catch (_) {}

      }


      throw new Error(
        msg
      );

    }


    if (!result?.success) {

      throw new Error(
        result?.error ||
        'Drive connection failed.'
      );

    }


    const folders =
      arr(
        result.folders
      );


    panel.style.display =
      'block';


    panel.innerHTML =
      folders.length

        ? `

          <div class="tiny">

            Google Drive connection successful.

          </div>


          ${folders
            .map(
              f => `

                <div
                  class="card"
                  style="
                    padding:14px;
                    margin-top:8px
                  "
                >

                  <b>
                    ${esc(f.name)}
                  </b>

                  <div class="tiny">

                    Folder ID:
                    ${esc(f.id)}

                  </div>


                  ${
                    f.webViewLink

                      ? `

                        <a
                          class="btn"
                          style="
                            display:inline-block;
                            margin-top:8px
                          "
                          href="${esc(
                            safeUrl(
                              f.webViewLink
                            )
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open in Drive
                        </a>

                      `

                      : ''
                  }

                </div>

              `
            )
            .join('')}

        `

        : `

          <div class="empty">

            Connected, but no
            CareerAxis Academy folder
            was found.

          </div>

        `;


  } catch (e) {

    alert(
      e.message ||
      'Unable to connect to Google Drive.'
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        'Manage mappings';

    }

  }

}


/* =========================================================
   MENU
   ========================================================= */

if ($('#menu')) {

  $('#menu').onclick =
    () =>
      $('#nav')
        .classList
        .toggle('open');

}


/* =========================================================
   LANGUAGE SWITCH
   ========================================================= */

if ($('#lang')) {

  $('#lang').onclick =
    () => {

      lang =
        lang === 'en'
          ? 'te'
          : 'en';


      localStorage.setItem(
        'careeraxis-lang',
        lang
      );


      $('#lang').textContent =
        lang === 'en'
          ? 'తెలుగు'
          : 'English';


      render();

    };

}


/* =========================================================
   EVENTS
   ========================================================= */

window.addEventListener(
  'hashchange',
  render
);


/* =========================================================
   START APPLICATION
   ========================================================= */

load();