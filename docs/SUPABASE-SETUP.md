# CareerAxis Academy — Supabase Setup

## 1. Create the free Supabase project
Create a project at https://supabase.com/ and keep it on the Free plan.

## 2. Run the database schema
Open SQL Editor and run `supabase-schema.sql`.

## 3. Google authentication
In Supabase: Authentication → Providers → Google → enable Google.
Configure the Google OAuth client using the Supabase callback URL shown by Supabase.
Add the production redirect URL:
`https://careeraxisacademy.in/#secure-panel`

## 4. Add frontend settings
Edit `site-config.js` and set only:
- `supabaseUrl`
- `supabaseAnonKey`
- YouTube channel ID/URL
- Telegram/WhatsApp/Instagram URLs

The two admin emails are intentionally fixed in `auth.js` and `site-config.js`:
- careeraxisacademy@gmail.com
- ravitejasiddana@gmail.com

Do not move these into a public editable CMS setting.

## 5. Admin authorization
The frontend allowlist is only a convenience check. Real authorization is enforced by the SQL `is_admin()` function using the authenticated email. Never rely on a hidden URL or JavaScript alone for security.

## 6. Google Drive owner rule
The production Drive connector must use OAuth for **careeraxisacademy@gmail.com only**. Store any refresh token/server credential only in server-side secrets. Never put it in `site-config.js`.

## 7. OTP
The admin flow is Google login → exact two-email allowlist → OTP to `careeraxisacademy@gmail.com`.
The included Edge Function is a secure contract/starter. To keep the mail cost at ₹0, use a Google Apps Script mail relay owned by `careeraxisacademy@gmail.com`, with OTP state kept server-side. Do not put a mail secret in the frontend.

## 8. Deployment
Push the project to the existing GitHub Pages repository. Keep the existing `CNAME` file and domain settings unchanged.

## 9. Why the emails are in the code
The two authorized emails are deliberately present in `auth.js` so the website can immediately reject other Google accounts. However, browser code can always be inspected or modified, so this is NOT the security boundary. The SQL `public.is_admin()` function independently checks the authenticated email at the database layer. Keep both layers.
