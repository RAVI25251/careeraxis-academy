# CareerAxis Academy — Admin SOP

## A. Admin login
1. Open the private admin route: `https://careeraxisacademy.in/#secure-panel`.
2. Click **Continue with Google**.
3. Use one of the two authorized accounts:
   - careeraxisacademy@gmail.com
   - ravitejasiddana@gmail.com
4. Complete the OTP step. OTP is sent to the protected CareerAxis security mailbox: careeraxisacademy@gmail.com.
5. Never share the private route, OTP or account credentials.

## B. Add a job
Admin → Jobs → Add Job → enter company, title, eligibility, dates and official application URL → Review → Publish.
Always verify the official source before publishing.

## C. Add resources
Upload resources to the correct Google Drive folder owned by careeraxisacademy@gmail.com. Example:
`CareerAxis Academy/TCS/Previous Papers/`
Then run Drive Sync. Review metadata and publish if approval is enabled.

## D. YouTube
Upload the video to the CareerAxis Academy channel. Scheduled YouTube Sync should add the new video. Check title, thumbnail and category before featuring it.

## E. Social links
Update Telegram, WhatsApp, Instagram and YouTube links from the protected admin settings. Never paste passwords or private social credentials into the website.

## F. Job expiry
Do not manually delete expired jobs unless required. The automation should move them from published/active to expired/archive based on the deadline.

## G. Security rules
- Exactly two authorized Google accounts.
- OTP mailbox: careeraxisacademy@gmail.com.
- Google Drive connector: careeraxisacademy@gmail.com only.
- Never put API secrets/service-role keys in frontend files.
- Never publish private Drive files.
- Review automatically collected job information before publication unless a trusted-source rule is explicitly enabled.
- Sign out after admin work on shared computers.

## H. If admin access fails
1. Confirm the Google account is one of the two authorized accounts.
2. Confirm Supabase Google provider is enabled.
3. Confirm `supabaseUrl` and `supabaseAnonKey` are correct.
4. Check the Supabase Auth logs.
5. Check Edge Function logs for OTP failures.
6. Do not disable RLS to make the dashboard work.
