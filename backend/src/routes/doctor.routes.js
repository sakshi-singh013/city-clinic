const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const { generatePostVisitSummary } = require("../services/llm.service");
const { queueNotification, postVisitSummaryEmail } = require("../services/notification.service");

const router = express.Router();
router.use(requireAuth("doctor"));

function myProfile(userId) {
  return db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(userId);
}

router.get("/me", (req, res, next) => {
  try {
    const profile = myProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: "Doctor profile not found." });
    res.json({ ...profile, working_hours: JSON.parse(profile.working_hours_json) });
  } catch (err) { next(err); }
});

router.get("/schedule", (req, res, next) => {
  try {
    const profile = myProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: "Doctor profile not found." });
    const { date } = req.query;
    const rows = date
      ? db.prepare(`
          SELECT a.*, p.name as patient_name FROM appointments a JOIN users p ON p.id = a.patient_id
          WHERE a.doctor_id = ? AND a.date = ? AND a.status != 'cancelled' ORDER BY a.start_time
        `).all(profile.id, date)
      : db.prepare(`
          SELECT a.*, p.name as patient_name FROM appointments a JOIN users p ON p.id = a.patient_id
          WHERE a.doctor_id = ? AND a.date >= date('now') AND a.status = 'confirmed' ORDER BY a.date, a.start_time
        `).all(profile.id);

    res.json(rows.map((r) => ({
      ...r,
      pre_visit_summary: r.pre_visit_summary_json ? JSON.parse(r.pre_visit_summary_json) : null
    })));
  } catch (err) { next(err); }
});

/**
 * Doctor submits post-visit clinical notes + structured prescription.
 * We: (1) generate a patient-friendly summary via LLM (graceful fallback
 * if it fails), (2) mark the appointment completed, (3) create medication
 * reminder rows so the background scheduler can send dose reminders,
 * (4) email the summary to the patient.
 */
router.post("/appointments/:id/notes", async (req, res, next) => {
  try {
    const profile = myProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: "Doctor profile not found." });

    const appt = db.prepare("SELECT * FROM appointments WHERE id = ? AND doctor_id = ?").get(req.params.id, profile.id);
    if (!appt) return res.status(404).json({ error: "Appointment not found." });

    const { doctorNotes, prescription } = req.body; // prescription: [{name,dosage,frequency_per_day,duration_days}]
    if (!doctorNotes) return res.status(400).json({ error: "doctorNotes is required." });

    const rx = Array.isArray(prescription) ? prescription : [];
    const summary = await generatePostVisitSummary(doctorNotes, rx);

    db.prepare(`
      UPDATE appointments
      SET doctor_notes = ?, prescription_json = ?, post_visit_summary_json = ?, status = 'completed', updated_at = datetime('now')
      WHERE id = ?
    `).run(doctorNotes, JSON.stringify(rx), JSON.stringify(summary), appt.id);

    // Create medication reminder schedules.
    const insertMed = db.prepare(`
      INSERT INTO medication_reminders (id, appointment_id, medication_name, dosage, frequency_per_day, reminder_times_json, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const med of rx) {
      const freq = Math.max(1, Math.min(6, Number(med.frequency_per_day) || 1));
      const times = spreadTimes(freq);
      const start = appt.date;
      const end = addDays(appt.date, Math.max(1, Number(med.duration_days) || 1));
      insertMed.run(uuid(), appt.id, med.name, med.dosage || "", freq, JSON.stringify(times), start, end);
    }

    const patient = db.prepare("SELECT name, email FROM users WHERE id = ?").get(appt.patient_id);
    const tpl = postVisitSummaryEmail({ recipientName: patient.name, doctorName: req.user.name, summaryText: summary.summary });
    queueNotification({ appointmentId: appt.id, type: "post_visit_summary", recipientEmail: patient.email, subject: tpl.subject, body: tpl.body });

    res.json({ ok: true, post_visit_summary: summary, medications_scheduled: rx.length });
  } catch (err) { next(err); }
});

// Evenly spread N reminder times across waking hours (08:00-22:00).
function spreadTimes(n) {
  const startMin = 8 * 60, endMin = 22 * 60;
  if (n === 1) return ["09:00"];
  const step = (endMin - startMin) / (n - 1);
  const times = [];
  for (let i = 0; i < n; i++) {
    const total = Math.round(startMin + step * i);
    times.push(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  }
  return times;
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
