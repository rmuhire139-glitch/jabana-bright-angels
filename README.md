# JABANA BRIGHT ANGELS PRE AND PRIMARY SCHOOL website

The public school pages remain available at `/`. The school is JABANA BRIGHT ANGELS PRE AND PRIMARY SCHOOL. Its crest in `frontend/public/jabana-bright-angels-logo.jpg` is used for the site logo and browser tab icon. School staff use `/academic-management` for the DOS dashboard and `/sign-in` for the school account login. Staff can recover access at `/forgot-password`. Administrators can manage authorized staff at `/admin/staff`.

## Local setup

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` in the project root.
3. Set `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env`. The browser does not connect to Supabase directly; it calls the same-origin `/api` backend, which uses the service key.
4. Set `SCHOOL_NAME` and `ACADEMIC_YEAR` to the school's approved display values. They are shown as “not configured” if left blank.
5. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD` in `.env` only for staff password-recovery email. For Gmail, use a Google App Password with 2-Step Verification enabled. School contact acknowledgments, notifications, and DOS replies use the connected Gmail OAuth mailbox instead.
6. Alternatively, configure Google OAuth for the school Gmail mailbox: add `<API_ORIGIN>/api/oauth/google/callback` as an authorized redirect URI (for local development, `http://localhost:3000/api/oauth/google/callback`), set up the consent screen/test users, and add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and a locally generated 32-byte base64 `GOOGLE_TOKEN_ENCRYPTION_KEY` to `.env`. Never share or commit credentials. In Google OAuth testing mode, refresh tokens may expire after seven days.
7. The imported database already contains the school's existing records and accounts. For a new installation only, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env`, use a unique password of at least 12 characters, run `npm run admin:create` once, then remove those bootstrap values.
8. Start the frontend and API: `npm run dev`.
9. Open the Vite URL shown in the terminal. The Vite development server forwards `/api` requests to the API on port 3000.

Do not commit `.env` or put database credentials in frontend code. In production, set `FRONTEND_URL` to the exact website origin and `NODE_ENV=production` so session cookies use the `Secure` attribute. Keep `SESSION_COOKIE_SAME_SITE=Lax` for same-site hosting; cross-site hosting requires HTTPS and `SESSION_COOKIE_SAME_SITE=None`. Set `PORT` if required by the host. The optional `MONGODB_SOURCE_URI` is only for the one-time legacy MongoDB importer; the app backend no longer connects to MongoDB.

## Vercel hosting

Import `rmuhire139-glitch/jabana-bright-angels` into Vercel with the repository root as the project root. The checked-in `vercel.json` builds the Vite frontend into `dist`, serves it as a static site, and rewrites client-side routes to `index.html`. The root API function and nested catch-all adapters for authentication, DOS, teacher, accountant, admin, and OAuth all forward to the shared backend app in `backend/api/[...path].ts`; do not use `npm start` as a Vercel start command.

In Vercel **Project Settings → Environment Variables**, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for both Production and Preview. Use the Supabase project URL and a server-side service-role/secret key; never prefix the key with `VITE_` or expose it in browser code. Set `FRONTEND_URL` for Production to the exact public production origin, currently `https://jabana-bright-angels.vercel.app` (or your custom domain). Leave it unset for Preview so each preview deployment uses its own `VERCEL_URL`. Add `SCHOOL_NAME` and `ACADEMIC_YEAR` only if you want to configure those display values. Set `SESSION_COOKIE_SAME_SITE=Lax` if overriding the default. Vercel sets `NODE_ENV` and `VERCEL` automatically; do not set `PORT` for the serverless function.

For Google mailbox integration, also add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` as Vercel environment variables. Set the OAuth redirect URI to `https://<your-production-domain>/api/oauth/google/callback` and register that exact URI with Google. For SMTP password recovery instead, add the `SMTP_*` settings. Never upload `.env`, put secrets in `VITE_*` variables, or configure `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` in Vercel. After changing environment variables, redeploy so the serverless functions receive them. The Supabase database is accessed only by the backend API.

Create the first administrator for a new installation from a trusted local machine using `npm run admin:create` with the Supabase URL, service key, and bootstrap credentials in the local, git-ignored `.env`. Remove the bootstrap credentials after creation. Manage backups with the Supabase project's backup/PITR settings. The MongoDB backup and importer are retained only for migration recovery.

## Project structure

- `frontend/src/` contains the React client; `App.tsx` owns public-page routing, while dashboard features are grouped into `AcademicManagement.tsx` and `Accountant.tsx` with their related stylesheets.
- `frontend/public/` contains static school branding; `frontend/src/assets/` contains imported page imagery.
- `backend/server/index.ts` configures the Express API and registers route handlers; `backend/server/models.ts` maps the existing API data model to Supabase tables; `backend/server/database.ts` owns server-side Supabase access.
- `backend/server/security/` separates password hashing, session lifecycle, and authentication/role middleware. `backend/server/auth.ts` re-exports that public authentication API for server entry points.
- `backend/server/academic.ts` contains reusable SDMS CSV parsing and timetable generation logic.
- `backend/api/[...path].ts` adapts the Express app for Vercel. The root `api/[...path].ts` is the Vercel function entrypoint and forwards to that backend adapter.
- `backend/scripts/` contains backend maintenance scripts such as database backups.

## Roles and access

- `administrator`: manages authorized staff accounts and can access the DOS dashboard.
- `dos`: accesses the academic management dashboard and its personal checklist.
- `dos_teacher`: one staff login with DOS dashboard access and the Teacher role.
- `teacher`: accesses a personal teaching dashboard to view assigned subjects and their timetable, submit studies, and use approved teaching tools after DOS or administrator approval into the Teachers group.
- `accountant`: accesses the accountant dashboard, fee records, and monthly fee collection reports. Monthly reports are also available to administrators; the API enforces this access.

The monthly accountant report summarizes fee payments received in the selected month, with totals and individual payment details. It can be printed from the dashboard.

Dashboard access is role-specific: DOS accounts use student, admissions, Teachers group, marks/report, and timetable sections; teachers use their own teacher workspace; accountants use stock, fees, family notices, and monthly reports. Administrators can access both the DOS and accountant dashboards. Only administrators and accountants can create or manage announcements; published announcements remain visible publicly.

Accountants and administrators can configure fee schedules by academic year, grade, and term, then explicitly apply a schedule to create balances for active students in that grade. Applying a schedule does not modify existing balances or payment records.

DOS, DOS/teacher, and administrator accounts connect the school's Gmail mailbox with Google OAuth from Academic Management. Gmail OAuth refresh tokens are encrypted in Supabase using `GOOGLE_TOKEN_ENCRYPTION_KEY`. SMTP credentials are not used for contact or student-registration email; they are only used for staff password-recovery email. Contact messages trigger an acknowledgment to the sender and a notification to active administrator, DOS, DOS/teacher, and accountant accounts. DOS replies are sent from the connected school mailbox with replies directed to the signed-in staff member. Registering an admitted student sends a confirmation to the guardian email on the admission inquiry. Creating a staff account sends a confirmation to that staff member's account email; initial passwords are never sent by email and must be provided separately and securely. If Gmail is not connected or delivery fails, the account/student registration remains saved and the dashboard reports the delivery failure. Dismissing a question removes it from the active list and notification count but retains its record in the database. Staff enter the official SDMS code issued in the SDMS portal, which this website stores but does not issue or verify. The dashboard lists registered students and their recorded SDMS codes.

Every signed-in teacher can enter a display name in their profile; it is shown on their personal teaching dashboard. Teachers can view their own assigned subjects, and if none have been assigned, the dashboard prompts them to contact the Director of Studies. Teacher accounts submit their studies in the teacher workspace. DOS or administrators review pending studies, approve Teachers group membership, and assign courses. Marks and import tools are available after approval; changing submitted studies requires review and approval again.

The API enforces roles on the server. Staff accounts are created by an administrator or during the one-time initial setup. Administrators should provide initial passwords securely and staff should change them after signing in. Passwords and recovery codes are stored as scrypt hashes. Recovery codes expire after 10 minutes, allow five verification attempts, and can only be requested once per minute per account. A successful reset invalidates existing sessions. Login sessions use random HttpOnly, SameSite cookies, are stored by hash in Supabase, expire after eight hours, and are revoked when a password changes or an account is disabled.

Supabase tables include `school_users`, `school_sessions`, `task_states`, `contact_messages`, `admission_inquiries`, `students`, `student_marks`, `teaching_assignments`, and `class_timetables`. Contact and admission forms store submissions without a public read endpoint. Checklist history is bounded and describes actions recorded in this school website only.

## CAMIS and SDMS

The dashboard opens the official systems in new tabs:

- CAMIS: <https://camis.nesa.gov.rw/login>
- SDMS: <https://sdms.gov.rw/>

No direct CAMIS or SDMS API, single sign-on, credential transfer, or scraping is implemented. The teacher dashboard displays the marks import control for all teachers; importing requires Teachers group approval, at least one assigned subject, and a selected SDMS CSV (up to 1 MB) with the expected marks columns. Marks match existing student records by SDMS student number only. Unmatched and invalid rows are reported. Re-importing the same student, subject code, assessment type/name, term, and year updates that assessment with the latest export. DOS and administrators can view imported end-of-term reports; reports display SDMS-calculated grades and points without applying another grading scale.

DOS and administrators configure weekly teacher/grade/subject period loads for an academic year. Only active, approved Teachers group members and their assigned subjects can be selected. Timetable generation schedules eight 40-minute periods on weekdays between 08:30 and 15:30, avoids teacher and class/grade clashes, and reports unschedulable loads rather than saving a partial timetable. Morning break is 10:00–10:20, lunch is 11:40–12:40, and transitions are 09:50–10:00 and 14:00–14:10. Sports and clubs are noted Monday–Thursday from 15:30–17:00; Friday has no after-school block. Teacher accounts see only their own timetable and assigned-subject marks.

## Checks

- `npm run build` builds and type-checks both the frontend and API.
- `npm run lint` runs Oxlint.
