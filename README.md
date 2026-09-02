# CareerAxis Academy — Website

Single-page, bilingual (English/Telugu) site for the CareerAxis Academy YouTube channel.
Plain HTML/CSS/JS — no build step, no framework, no server. Free to host, near-zero maintenance.

## Before you publish — replace these placeholders

In `index.html`, search for and update:

1. `YOUR_CHANNEL_HANDLE` (appears 3 times) → your actual YouTube handle, e.g. `@CareerAxisAcademy`
2. `YOUR_CHANNEL_ID` → your YouTube channel ID, so the embedded player shows your latest uploads.
   Find it at https://www.youtube.com/account_advanced while logged into your channel.
3. `YOUR_FORM_ID` → create a free form at https://formspree.io (free tier: 50 submissions/month),
   then paste the form ID it gives you.
4. The two `href="#"` placeholders in the footer → your LinkedIn and Instagram links (or delete those lines).

## Run it locally

No build tools needed. Just open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publish for free (Cloudflare Pages)

1. Push this folder to a GitHub repo (see commands below).
2. Go to https://dash.cloudflare.com → Pages → Create a project → Connect to Git.
3. Select the repo. Build settings: leave build command blank, output directory `/`.
4. Deploy — you'll get a free `*.pages.dev` URL immediately.
5. Later, add a custom domain (e.g. `careeraxisacademy.com`) for ~$9-12/year via Cloudflare Registrar,
   under Pages → your project → Custom domains. SSL is automatic.

Every future `git push` redeploys the live site automatically — that's the only maintenance step.

## Push to GitHub

```bash
cd careeraxis-site
git init
git add .
git commit -m "Initial CareerAxis Academy website"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

(Create the empty repo first at https://github.com/new — don't initialize it with a README there,
to avoid a merge conflict with this one.)
