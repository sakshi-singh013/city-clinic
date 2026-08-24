# System Design Write-up

## Slot hold mechanism

Booking is two steps, not one. The moment a patient taps a time slot, the
client calls `POST /appointments/hold`, which inserts a row into
`slot_holds` keyed by `(doctor_id, date, start_time)` with a 5-minute
expiry. A `UNIQUE` index on that same triple means a second patient
racing for the identical slot gets a clean `409` from the database itself,
not from application logic that might have a gap in it. Only after the
hold succeeds does the patient see the symptom form. This matters because
the form takes real time to fill in — without a hold, two patients could
both pass the "is it free?" check, then both submit, and one would silently
overwrite or duplicate the other's booking.

Holds are cheap and self-cleaning: a cron job sweeps expired holds every
minute, and a patient's own stale hold from an earlier attempt is deleted
before a new one is created, so retrying never dead-locks a slot against
yourself.

## Double-booking prevention

The hold protects the multi-step *flow*, but the real guarantee lives one
layer down, on the `appointments` table itself: a partial `UNIQUE` index
on `(doctor_id, date, start_time) WHERE status NOT IN ('cancelled',
'cancelled_by_leave')`. Confirming a booking runs inside a single SQLite
transaction that (1) re-checks the hold hasn't expired, (2) re-checks no
confirmed appointment already exists for that slot, then (3) inserts. If
two confirms somehow reach step 3 simultaneously — a hold expiring at the
exact instant a second patient re-holds and confirms, for example — the
unique index rejects the second `INSERT` outright and the API returns a
409 asking the patient to pick another time. The database constraint is
the actual source of truth; the transaction and the hold are there to
make the *common* case fast and the *conflict* case rare, not to replace
the guarantee.

This two-layer approach (soft hold for UX, hard constraint for
correctness) means the system stays correct even if the hold logic has a
bug, a request is retried, or the app is scaled to multiple server
instances — SQLite's constraint enforcement doesn't care how many app
processes are calling it.

## Doctor leave conflict handling

When an admin marks a doctor unavailable (`POST
/admin/doctors/:id/leave`), the leave record and the cancellation of every
affected `confirmed` appointment happen inside one transaction: insert
into `doctor_leaves`, then `UPDATE appointments SET status =
'cancelled_by_leave'` for every match on `(doctor_id, date)`. Doing this
atomically means there's no window where the doctor is marked on leave
but a stale appointment is still bookable-looking, or vice versa.

Side effects — emailing each affected patient and deleting their calendar
events — happen *after* the transaction commits, deliberately outside it.
If an email fails to send or Google's API times out, that must never roll
back a leave the admin already confirmed; the notification queue (below)
picks up the slack instead. The patient's symptom notes are preserved on
the cancelled row so nothing is lost if they rebook.

## Notification failure handling

Every outbound email is written to a `notifications` table *before* it's
sent, with `status='pending'`. A background job runs every 2 minutes,
picks up anything `pending` or previously `failed` (capped at 5 attempts),
and tries to send it. A failure updates `attempts`, records `last_error`,
and reschedules the row further into the future with simple linear
backoff (5, 10, 15... minutes) rather than hammering a struggling SMTP
server. Success marks the row `sent`.

This means a transient SMTP outage, a process restart, or a slow network
blip never silently drops a booking confirmation, cancellation, or
medication reminder — it just retries on the next tick, and an admin can
see exactly how many notifications are stuck in `failed` state via the
overview dashboard. Locally, when no SMTP credentials are configured at
all, the server creates a disposable Ethereal test inbox on startup and
logs a preview URL for every "sent" email, so the whole pipeline is
inspectable without any real credentials.

Medication reminders reuse the same queue: a `medication_reminders` row
stores a JSON list of times-of-day computed from prescription frequency,
and a separate 15-minute job checks which are due, queues a
`medication_reminder` notification (deduplicated per day via a lookup
against already-sent notifications for that appointment), and lets the
same retry-safe delivery path handle the rest — one failure-handling
mechanism serves every notification type in the system.
