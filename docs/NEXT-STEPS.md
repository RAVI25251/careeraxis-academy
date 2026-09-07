# CareerAxis Academy v3.3 — Current Setup

## Current status

Completed:
- GitHub Pages custom domain: `careeraxisacademy.in`
- Supabase project created
- Supabase Site URL configured for `https://careeraxisacademy.in`
- Google Auth Platform configured as External
- Google Web OAuth client created
- Supabase Google provider enabled
- CareerAxis database tables and RLS policies installed

## Next steps

1. Put the Supabase Project URL in `site-config.js` as `supabaseUrl`.
2. Put the Supabase Publishable key in `site-config.js` as `supabaseAnonKey`.
3. Test Google admin sign-in.
4. Configure the two authorized admin accounts:
   - careeraxisacademy@gmail.com
   - ravitejasiddana@gmail.com
5. Complete the server-side admin OTP function. The current Edge Function is intentionally a starter and must not be treated as production OTP until secure OTP storage and an email delivery mechanism are configured.
6. Implement secure Google Drive OAuth using only `careeraxisacademy@gmail.com`; never put a Drive refresh token or private credential in browser code.
7. Replace placeholder content/resource links with real content.
8. Only after testing, push the package to GitHub.

## Important security rules

- Never put Supabase secret/service-role keys in frontend files.
- Never put Google OAuth client secrets in frontend files.
- Never put Google Drive refresh tokens in frontend files.
- The hidden admin route is only an additional layer of obscurity; Supabase RLS is the real authorization boundary.
- Keep public website browsing available without login.
