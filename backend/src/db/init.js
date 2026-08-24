const db = require("./connection");

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('patient','doctor','admin')),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      google_refresh_token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      specialization TEXT NOT NULL,
      bio TEXT,
      slot_duration_minutes INTEGER NOT NULL DEFAULT 20,
      working_hours_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctor_leaves (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(doctor_id, date)
    );

    -- Short-lived hold created the instant a patient picks a slot, before
    -- they finish the symptom form. Prevents two patients racing on the
    -- same slot during the multi-step booking flow.
    CREATE TABLE IF NOT EXISTS slot_holds (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      held_by_patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- A slot can only be held once at a time regardless of how many
    -- (unexpired) hold rows exist for it logically; enforced in app layer
    -- via transaction + this index for the common case.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_holds_unique
      ON slot_holds(doctor_id, date, start_time);

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id TEXT NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK(status IN ('confirmed','cancelled','cancelled_by_leave','completed','no_show')),
      symptoms_text TEXT,
      pre_visit_summary_json TEXT,
      urgency TEXT CHECK(urgency IN ('Low','Medium','High') OR urgency IS NULL),
      doctor_notes TEXT,
      prescription_json TEXT,
      post_visit_summary_json TEXT,
      calendar_event_id_patient TEXT,
      calendar_event_id_doctor TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- THE core double-booking guard: a doctor can have at most one
    -- non-cancelled appointment per (date, start_time), enforced by the
    -- database itself, not just application logic.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_no_double_book
      ON appointments(doctor_id, date, start_time)
      WHERE status NOT IN ('cancelled','cancelled_by_leave');

    CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, date);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN (
        'booking_confirmation','reminder','cancellation',
        'leave_notice','medication_reminder','post_visit_summary'
      )),
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS medication_reminders (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      medication_name TEXT NOT NULL,
      dosage TEXT,
      frequency_per_day INTEGER NOT NULL DEFAULT 1,
      reminder_times_json TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      last_sent_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_med_active ON medication_reminders(start_date, end_date);
  `);
}

module.exports = init;
