# City Clinic — Healthcare Appointment & Follow-up Manager

A full-stack clinic platform with separate patient, doctor, and admin
portals: symptom-aware booking, an AI pre-visit brief for the doctor, a
patient-friendly AI post-visit summary, medication reminders, and email +
Google Calendar sync — all backed by a zero-config SQLite database so you
can clone it and run it with no external services required.

- **Backend:** Node.js, Express, SQLite (`better-sqlite3`)
- **Frontend:** React 18, Vite, Tailwind CSS
- **AI:** Anthropic API (with automatic graceful fallback if unconfigured)
- **Email:** Nodemailer (auto-provisions a free Ethereal test inbox if you
  don't configure real SMTP — zero setup required to see it work)
- **Calendar:** Google Calendar API via OAuth 2.0 (optional — the app
  works fully without it)

---

## 1. Quick start

Requires **Node.js 18+**.

```bash
# 1. Backend
cd backend
cp .env.example .env
npm install
npm run seed      # creates the SQLite DB and demo accounts
npm start          # http://localhost:4000

# 2. Frontend (in a second terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open **http://localhost:5173**. That's it — no Postgres, no Docker, no
API keys required to explore the whole flow. Where a key isn't provided
(LLM, SMTP, Google Calendar), the app automatically falls back to a
working local substitute (see sections 4–6) rather than breaking.

### Demo accounts (password for all: `Password123!`)

| Role    | Email                       |
|---------|------------------------------|
| Admin   | admin@clinic.test            |
| Patient | patient@clinic.test          |
| Doctor  | ananya.rao@clinic.test (General Physician) |
| Doctor  | vikram.nair@clinic.test (Cardiologist)     |
| Doctor  | sara.iqbal@clinic.test (Dermatologist)     |
| Doctor  | rohan.mehta@clinic.test (Pediatrician)     |

### Suggested demo path

1. Log in as **patient** → *Book appointment* → pick a doctor and slot →
   describe symptoms mentioning something like "severe chest pain and
   shortness of breath" → confirm. Watch the urgency badge come back
   **High**.
2. Log in as that **doctor** → the appointment sorts to the top of the
   schedule by urgency → open it, read the AI pre-visit brief → write
   clinical notes + a prescription → *Complete visit*.
3. Log back in as the **patient** → *My appointments* → the pulseline
   status tracker shows all four stages complete, and the patient-friendly
   summary + medication schedule are visible.
4. Log in as **admin** → *Leave* → mark a doctor unavailable on a date
   with an existing booking → see the affected-appointment count and
   check the console log for the cancellation email preview link.

---

## 2. Environment variables (`backend/.env`)

See `backend/.env.example` for the full, commented list. Nothing is
required to run the app locally — every integration below degrades
gracefully when its variables are left blank.

---

## 3. Database schema

SQLite file at `backend/data/clinic.db` (path configurable via `DB_PATH`).
Created automatically by `src/db/init.js` on first run.

- **users** — `id, role (patient/doctor/admin), name, email, password_hash, phone, google_refresh_token`
- **doctor_profiles** — `id, user_id, specialization, bio, slot_duration_minutes, working_hours_json`
- **doctor_leaves** — `id, doctor_id, date, reason` — unique per `(doctor_id, date)`
- **slot_holds** — `id, doctor_id, date, start_time, held_by_patient_id, expires_at` — unique per `(doctor_id, date, start_time)`
- **appointments** — `id, patient_id, doctor_id, date, start_time, end_time, status, symptoms_text, pre_visit_summary_json, urgency, doctor_notes, prescription_json, post_visit_summary_json, calendar_event_id_patient, calendar_event_id_doctor` — partial unique index on `(doctor_id, date, start_time)` for non-cancelled rows (the double-booking guard)
- **notifications** — `id, appointment_id, type, recipient_email, subject, body, status, attempts, last_error, scheduled_at, sent_at` — the retry-safe email queue
- **medication_reminders** — `id, appointment_id, medication_name, dosage, frequency_per_day, reminder_times_json, start_date, end_date`

Full column definitions and constraints: `backend/src/db/init.js`.

See **`SYSTEM_DESIGN.md`** for how these tables work together to prevent
double-booking, handle leave conflicts, and guarantee notification
delivery.

---

## 4. LLM integration

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default
`claude-sonnet-5` — double-check the current model name at
[docs.claude.com](https://docs.claude.com) before deploying) in
`backend/.env` to enable real AI summaries. Without a key, the app uses a
deterministic rule-based fallback for both prompts below, tagged
`"source": "fallback"` in the stored JSON so the UI can show it wasn't
AI-generated. **The app never breaks or blocks booking/visit completion
if the LLM call fails for any reason** — see `src/services/llm.service.js`.

**Pre-visit prompt** (run on booking confirmation):
> Analyse these symptoms and return: urgency level (Low / Medium / High),
> chief complaint, and three suggested questions for the doctor. Symptoms:
> `<symptoms>`

**Post-visit prompt** (run when the doctor submits notes):
> Convert these clinical notes into a patient-friendly summary with
> medication schedule and follow-up steps: `<notes>`

Both are sent with a system prompt instructing strict-JSON-only output;
the response is parsed and validated before being stored.

---

## 5. Email

If `SMTP_HOST` is left blank, the server auto-creates a free
[Ethereal](https://ethereal.email) test inbox on startup and prints a
`Preview: https://ethereal.email/message/...` link to the console for
every notification — open it to see the actual rendered email, no signup
needed. To send real email, fill in `SMTP_HOST` / `SMTP_PORT` /
`SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` with your provider's credentials
(SendGrid, Mailgun, or a plain SMTP account all work via
`nodemailer.createTransport`).

All emails go through the `notifications` table first and are delivered
by a background job with automatic retries — see `SYSTEM_DESIGN.md`.

---

## 6. Google Calendar setup (optional)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → create a project (or use an existing one).
2. **APIs & Services → Library** → enable the **Google Calendar API**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
4. Under **Authorized redirect URIs**, add:
   `http://localhost:4000/api/calendar/oauth/callback`
   (match this to `GOOGLE_REDIRECT_URI` in your `.env` — update both for
   production).
5. Copy the generated **Client ID** and **Client secret** into
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `backend/.env`. Restart
   the backend.
6. In the app, any logged-in user can call `GET /api/calendar/oauth/start`
   (wire this to a "Connect Google Calendar" button — not included in the
   default UI, since it's optional) to get a consent URL, approve access,
   and their refresh token is stored so future bookings sync automatically.

Without these variables set, `calendar.service.js` silently no-ops on
every call — booking, cancelling, and rescheduling all continue working
normally, just without calendar sync.

---

## 7. API reference

All routes are prefixed `/api` and (except `/auth/*`) require
`Authorization: Bearer <jwt>`.

**Auth**
- `POST /auth/register` `{name, email, password, phone?}` → creates a patient
- `POST /auth/login` `{email, password}`

**Patient** (`role: patient`)
- `GET /patient/specializations`
- `GET /patient/doctors?specialization=`
- `GET /patient/doctors/:id/slots?date=YYYY-MM-DD`

**Appointments** (patient/doctor/admin, ownership-checked per action)
- `POST /appointments/hold` `{doctorId, date, startTime, endTime}`
- `POST /appointments/confirm` `{holdId, symptomsText}`
- `GET /appointments/mine`
- `POST /appointments/:id/cancel`

**Doctor** (`role: doctor`)
- `GET /doctor/me`
- `GET /doctor/schedule?date=`
- `POST /doctor/appointments/:id/notes` `{doctorNotes, prescription: [{name, dosage, frequency_per_day, duration_days}]}`

**Admin** (`role: admin`)
- `GET /admin/overview`
- `GET /admin/doctors`
- `POST /admin/doctors` `{name, email, phone?, specialization, bio?, slot_duration_minutes?, working_hours}`
- `PATCH /admin/doctors/:id`
- `POST /admin/doctors/:id/leave` `{date, reason?}`
- `GET /admin/doctors/:id/leave`

**Calendar**
- `GET /calendar/status`
- `GET /calendar/oauth/start`
- `GET /calendar/oauth/callback` (redirect target, not called directly)

---

## 8. Project structure

```
backend/
  src/
    db/            schema, connection, seed data
    middleware/     auth, error handling
    routes/         auth, patient, doctor, admin, appointments, calendar
    services/       llm, email, notifications, calendar, scheduler (cron)
    utils/          jwt, slot generation
frontend/
  src/
    api/            fetch client
    context/        auth context
    components/     Nav, Pulse (EKG signature components), UrgencyBadge, Protected
    pages/           Landing, Login, Register, patient/, doctor/, admin/
SYSTEM_DESIGN.md     double-booking, leave conflicts, notification reliability
```

---

## 9. Deploying to Render (recommended — free, one click)

This repo includes `render.yaml`, a Render **Blueprint** that deploys the
backend (as a Node web service with a persistent disk for the SQLite file)
and the frontend (as a static site) together in one step.

1. Push this project to a GitHub repo (Render deploys from a repo, it
   doesn't accept a zip upload).
2. In the [Render dashboard](https://dashboard.render.com), click
   **New → Blueprint**, connect the repo, and Render will read
   `render.yaml` and show both services (`city-clinic-backend`,
   `city-clinic-frontend`).
3. Render will prompt you for the env vars marked `sync: false` in
   `render.yaml` (`ANTHROPIC_API_KEY`, `SMTP_*`, `GOOGLE_CLIENT_*`) —
   these are all optional; leave them blank to use the automatic
   fallbacks described earlier in this README, and fill them in later
   from **Environment** on the backend service whenever you're ready.
4. Click **Apply**. Both services build and deploy (a few minutes).
5. Open the backend service's **Shell** tab and run `npm run seed` once
   to create the demo accounts (or just register a real patient account
   through the UI — either works).
6. Visit the frontend's `.onrender.com` URL — that's your live app.

**If Render assigns different URLs than the ones in `render.yaml`**
(happens if `city-clinic-backend` / `city-clinic-frontend` are already
taken), update `CLIENT_URL` and `GOOGLE_REDIRECT_URI` on the backend
service and `VITE_API_URL` on the frontend service to match what Render
actually gave you, then trigger a manual redeploy of the frontend (env
vars for static sites are baked in at build time, so it must rebuild).

**To connect Google Calendar** after deploying: use the *deployed*
backend's callback URL (`https://<your-backend>.onrender.com/api/calendar/oauth/callback`)
as the Authorized redirect URI in Google Cloud Console (see section 6),
then set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the backend
service in Render and redeploy.

Render's free tier spins services down after inactivity — the first
request after a while will be slow (~30s) while it wakes up. That's
normal, not a bug.

## 10. Deploying elsewhere

Any Node host works for the backend (Railway, Fly.io, a VPS) — just set
`DB_PATH` to a persistent volume (SQLite is a single file) and `CLIENT_URL`
to your frontend's origin for CORS. Any static host works for the frontend
(Vercel, Netlify, Cloudflare Pages) — set `VITE_API_URL` to your deployed
backend's `/api` URL as a build-time environment variable before running
`npm run build`.
