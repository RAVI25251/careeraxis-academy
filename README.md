# CareerAxis Academy — Full Website Platform

Domain: https://careeraxisacademy.in

## Frontend included
- Premium responsive CareerAxis design inspired by the supplied reference screenshot
- English + Telugu language switch
- Home / Courses / Course details / Resources / About / Contact
- Student signup/login demo
- Student dashboard
- Course enrollment
- YouTube lesson embeds
- Lesson progress tracking
- FAQ
- YouTube / Instagram / Telegram integration points
- Mobile responsive navigation
- GitHub Pages CNAME for careeraxisacademy.in

## Social links
Open `site-config.js` and paste your real:
- YouTube URL
- Instagram URL
- Telegram URL

The UI will automatically show the links after you add them.

## Important production note
The included authentication is browser-only demo mode using localStorage.
Do NOT use it to protect paid content or collect real student passwords.

For production:
1. Create a Supabase project.
2. Run `supabase-schema.sql`.
3. Configure Supabase Auth.
4. Replace the demo auth/data calls in `script.js` with Supabase queries.
5. Add Row Level Security policies.
6. Add server-side payment verification before accepting paid enrollments.
7. Never place Supabase `service_role` keys in frontend code.

## GitHub Pages
Keep `CNAME` in the repository root:
careeraxisacademy.in

In GitHub:
Settings → Pages → Deploy from branch → main → / (root)

Then set Custom domain to:
careeraxisacademy.in

## GoDaddy DNS for GitHub Pages
At GoDaddy DNS, use:
A @ 185.199.108.153
A @ 185.199.109.153
A @ 185.199.110.153
A @ 185.199.111.153

CNAME www RAVI25251.github.io

Remove conflicting A/AAAA/CNAME records for the same host, but do not remove MX records used for email.

After DNS and certificate provisioning, enable Enforce HTTPS.

## Next production modules
- Supabase Auth + profiles
- Admin dashboard
- Instructor dashboard
- Real course CRUD
- Real progress sync
- Quizzes and question bank
- Certificates
- Razorpay/payment integration
- Email notifications
- Student support/tickets
- Search engine SEO pages
- Privacy policy / Terms / Refund policy
