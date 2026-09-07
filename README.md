# CareerAxis Academy — v3.3 Supabase Foundation

This is the current working foundation for CareerAxis Academy. It is based on v3.1 Secure Admins and is intended to be connected to the Supabase project that has now been configured.

**Do not push to GitHub until the Supabase connection, admin login, OTP, and Google Drive resource flow are tested.**

See `docs/NEXT-STEPS.md` and `docs/SUPABASE-SETUP.md`.

# CareerAxis Academy v3 — Automated Career Platform

CareerAxis Academy is a free career/jobs/education information platform designed for GitHub Pages + Supabase + Google Drive + YouTube automation.

## Admin security model
The public site contains no admin link. Admin route: `#secure-panel`.

Only these two Google accounts are authorized:
- careeraxisacademy@gmail.com
- ravitejasiddana@gmail.com

The login flow is:
Google Sign-In → exact email allowlist → OTP to careeraxisacademy@gmail.com → Admin Dashboard.

Real authorization must be enforced by Supabase RLS/server-side checks; the hidden route is not a security boundary by itself.

## Google Drive
The production connector is restricted to the Google Drive account owned by careeraxisacademy@gmail.com. Keep OAuth refresh tokens and other secrets server-side.

## Included
- YouTube-centric homepage
- Jobs
- Resources / Drive mapping architecture
- Career paths
- Calendar
- Community links
- English/Telugu-ready structure
- Supabase schema and RLS foundation
- Google auth admin gate
- Two-admin allowlist
- OTP Edge Function contract/starter
- GitHub Actions automation starter
- Admin SOP
- Setup documentation

## Important
This package does not contain API keys, OAuth secrets or passwords. Complete `docs/SUPABASE-SETUP.md` before production use.
