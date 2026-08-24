const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const {
  queueNotification,
  leaveNoticeEmail,
  cancellationEmail
} = require("../services/notification.service");
const calendarService = require("../services/calendar.service");

const router = express.Router();
router.use(requireAuth("admin"));

// ---- Doctor management ----

router.get("/doctors", (req, res, next) => {
  try {
    const doctors = db.prepare(`
      SELECT dp.id, dp.specialization, dp.bio, dp.slot_duration_minutes, dp.working_hours_json,
             u.id as user_id, u.name, u.email, u.phone
      FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
      ORDER BY u.name
    `).all();
    res.json(doctors.map((d) => ({ ...d, working_hours: JSON.parse(d.working_hours_json) })));
  } catch (err) { next(err); }
});

router.post("/doctors", (req, res, next) => {
  try {
    const { name, email, phone, specialization, bio, slot_duration_minutes, working_hours } = req.body;
    if (!name || !email || !specialization) {
      return res.status(400).json({ error: "Name, email and specialization are required." });
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const tempPassword = Math.random().toString(36).slice(-10);
    const userId = uuid();
    const profileId = uuid();

    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO users (id, role, name, email, password_hash, phone) VALUES (?, 'doctor', ?, ?, ?, ?)`)
        .run(userId, name, email.toLowerCase(), bcrypt.hashSync(tempPassword, 10), phone || null);
      db.prepare(`
        INSERT INTO doctor_profiles (id, user_id, specialization, bio, slot_duration_minutes, working_hours_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(profileId, userId, specialization, bio || null, slot_duration_minutes || 20,
        JSON.stringify(working_hours || {}));
    });
    tx();

    res.status(201).json({
      doctor: { id: profileId, user_id: userId, name, email: email.toLowerCase(), specialization },
      temporary_password: tempPassword
    });
  } catch (err) { next(err); }
});

router.patch("/doctors/:id", (req, res, next) => {
  try {
    const { specialization, bio, slot_duration_minutes, working_hours } = req.body;
    const existing = db.prepare("SELECT * FROM doctor_profiles WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Doctor not found." });

    db.prepare(`
      UPDATE doctor_profiles
      SET specialization = COALESCE(?, specialization),
          bio = COALESCE(?, bio),
          slot_duration_minutes = COALESCE(?, slot_duration_minutes),
          working_hours_json = COALESCE(?, working_hours_json)
      WHERE id = ?
    `).run(specialization, bio, slot_duration_minutes, working_hours ? JSON.stringify(working_hours) : null, req.params.id);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Leave management (with conflict handling) ----

router.post("/doctors/:id/leave", async (req, res, next) => {
  try {
    const doctorId = req.params.id;
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)." });

    const doctor = db.prepare(`
      SELECT dp.id, u.name as doctor_name FROM doctor_profiles dp
      JOIN users u ON u.id = dp.user_id WHERE dp.id = ?
    `).get(doctorId);
    if (!doctor) return res.status(404).json({ error: "Doctor not found." });

    // Insert leave + find affected confirmed appointments atomically.
    let affected = [];
    const tx = db.transaction(() => {
      db.prepare(`INSERT OR IGNORE INTO doctor_leaves (id, doctor_id, date, reason) VALUES (?, ?, ?, ?)`)
        .run(uuid(), doctorId, date, reason || null);

      affected = db.prepare(`
        SELECT a.*, p.name as patient_name, p.email as patient_email
        FROM appointments a JOIN users p ON p.id = a.patient_id
        WHERE a.doctor_id = ? AND a.date = ? AND a.status = 'confirmed'
      `).all(doctorId, date);

      for (const appt of affected) {
        db.prepare(`UPDATE appointments SET status='cancelled_by_leave', updated_at=datetime('now') WHERE id=?`)
          .run(appt.id);
      }
    });
    tx();

    // Side effects (email + calendar) happen after the transaction commits,
    // and are best-effort: a failure here must not undo the leave/cancellations.
    for (const appt of affected) {
      const tpl = leaveNoticeEmail({
        recipientName: appt.patient_name,
        doctorName: doctor.doctor_name,
        date: appt.date,
        startTime: appt.start_time
      });
      queueNotification({
        appointmentId: appt.id,
        type: "leave_notice",
        recipientEmail: appt.patient_email,
        subject: tpl.subject,
        body: tpl.body
      });
      calendarService.deleteEventForUser({ userId: appt.patient_id, eventId: appt.calendar_event_id_patient }).catch(() => {});
      calendarService.deleteEventForUser({ userId: doctor.id, eventId: appt.calendar_event_id_doctor }).catch(() => {});
    }

    res.json({ ok: true, affected_appointments: affected.length });
  } catch (err) { next(err); }
});

router.get("/doctors/:id/leave", (req, res, next) => {
  try {
    const leaves = db.prepare(`SELECT * FROM doctor_leaves WHERE doctor_id = ? ORDER BY date`).all(req.params.id);
    res.json(leaves);
  } catch (err) { next(err); }
});

router.get("/overview", (req, res, next) => {
  try {
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role='patient') as patients,
        (SELECT COUNT(*) FROM doctor_profiles) as doctors,
        (SELECT COUNT(*) FROM appointments WHERE status='confirmed') as upcoming_appointments,
        (SELECT COUNT(*) FROM appointments WHERE status='completed') as completed_appointments,
        (SELECT COUNT(*) FROM notifications WHERE status='failed') as failed_notifications
    `).get();
    res.json(counts);
  } catch (err) { next(err); }
});

module.exports = router;
