# CareerAxis Academy v2 - deployment guide

Overlay package: copy these files over your repository.
Do NOT delete or replace: `assets/` (your logo), `CNAME`, `auth.js`, `site-config.js`,
`privacy.html`, `terms.html`, `supabase/functions/admin-otp`, `supabase/functions/drive-manager`.

## 1. Database (already done if "careeraxis-complete-database.sql" ran successfully)
Then run `supabase-patch-v2-1.sql` once (adds `updated_at` to `youtube_videos`).

## 2. Website files
Copy into the repo root (replace when asked): `index.html`, `styles.css`, `app.js`,
`robots.txt`, `sitemap.xml`, `data/content.json`, `jobs/` (folder),
`scripts/` (folder), `.github/workflows/automation.yml`,
`supabase/functions/job-updater/`, `supabase-patch-v2-1.sql`, `docs/DEPLOY-V2.md`.

Easiest way: GitHub repo -> Add file -> Upload files -> drag the extracted folders -> Commit.
(Folders keep their paths when dragged in.)

## 3. Edge Function + secrets (needs the Supabase CLI)
```
supabase functions deploy job-updater --no-verify-jwt --project-ref gkkbvzgoqgzblecyhpfk
supabase secrets set AUTOMATION_SECRET="<long random string>" --project-ref gkkbvzgoqgzblecyhpfk
```
Optional AI collection:
```
supabase secrets set ANTHROPIC_API_KEY="..." ANTHROPIC_MODEL="<model id from your Anthropic console>" --project-ref gkkbvzgoqgzblecyhpfk
```
Optional (publish verified jobs without review; default is drafts): `supabase secrets set AUTO_PUBLISH=true`

## 4. GitHub
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:
- `AUTOMATION_SECRET` = the same value as in Supabase
- `JOB_UPDATER_URL`  = `https://gkkbvzgoqgzblecyhpfk.supabase.co/functions/v1/job-updater`

Settings -> Actions -> General -> Workflow permissions -> **Read and write permissions**.
Settings -> Pages -> Source must be **Deploy from a branch** (as it is today).

## 5. First run
Actions -> **CareerAxis Automation** -> Run workflow. After that it runs at 09:00 and 18:00 IST.
It expires closed jobs, collects drafts from approved sources (if configured), rebuilds
`/jobs/` pages and `sitemap.xml`, commits, and triggers a Pages build.

## 6. AI job collection (optional)
Supabase -> Table Editor -> `job_sources` -> Insert row:
`name`, `url` (official https page), `category`, `allowed_domains` (e.g. `{tspsc.gov.in}`).
Jobs arrive as unpublished drafts. Admin -> Jobs -> Edit -> check against the official notice
-> tick Published -> Save.

## 7. Google
Search Console -> add `https://careeraxisacademy.in` -> submit `sitemap.xml`.
A job gets JobPosting structured data only if its Description is 80+ characters.

## Notes
- Newly published jobs show on the site immediately; their static `/jobs/<slug>/` page and
  sitemap entry appear at the next 09:00 / 18:00 IST run (or run the workflow manually).
- Rollback: restore the previous repository commit. The database changes are additive.
