const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const { generatePreVisitSummary } = require("../services/llm.service");
const {
  queueNotification,
  bookingConfirmationEmail,
  cancellationEmail
} = require("../services/notification.service");
const calendarService = require("../services/calendar.service");

const router = express.Router();
router.use(requireAuth("patient", "doctor", "admin"));

const HOLD_TTL_MINUTES = 5;

/**
 * Step 1 of booking: place a short-lived hold on a slot the instant the
 * patient picks it, before they've finished the symptom form. This is
 * what prevents two patients racing on the same slot mid-flow - the
 * UNIQUE index on slot_holds(doctor_id, date, start_time) means a second
 * concurrent request gets a clean 409 instead of a corrupted booking.
 */
router.post("/hold", (req, res, next) => {
  try {
    if (req.user.role !== "patient") return res.status(403).json({ error: "Only patients can book appointments." });
    const { doctorId, date, startTime, endTime } = req.body;
    if (!doctorId || !date || !startTime || !endTime) {
      return res.status(400).json({ error: "doctorId, date, startTime and endTime are required." });
    }

    const onLeave = db.prepare("SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND date = ?").get(doctorId, date);
    if (onLeave) return res.status(409).json({ error: "The doctor is unavailable on that date." });

    const taken = db.prepare(`
      SELECT 1 FROM appointments WHERE doctor_id = ? AND date = ? AND start_time = ?
      AND status NOT IN ('cancelled','cancelled_by_leave')
    `).get(doctorId, date, startTime);
    if (taken) return res.status(409).json({ error: "That slot is already booked." });

    // Clear this patient's own stale hold(s) first so retries don't 409 on themselves.
    db.prepare(`DELETE FROM slot_holds WHERE held_by_patient_id = ? AND expires_at < datetime('now', '+1 minute')`)
      .run(req.user.id);

    const id = uuid();
    db.prepare(`
      INSERT INTO slot_holds (id, doctor_id, date, start_time, held_by_patient_id, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+${HOLD_TTL_MINUTES} minutes'))
    `).run(id, doctorId, date, startTime, req.user.id);

    res.status(201).json({ holdId: id, endTime, expiresInMinutes: HOLD_TTL_MINUTES });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That slot was just taken by someone else. Please pick another time." });
    }
    next(err);
  }
});

/**
 * Step 2: patient submits the symptom form to confirm. Runs inside a
 * single SQLite transaction: re-validate the hold, re-check for a
 * conflicting confirmed appointment, then insert. The UNIQUE partial
 * index on appointments is the final safety net if two holds somehow
 * both reach this point (e.g. after independent expiry + re-hold races).
 */
router.post("/confirm", async (req, res, next) => {
  try {
    if (req.user.role !== "patient") return res.status(403).json({ error: "Only patients can book appointments." });
    const { holdId, symptomsText } = req.body;
    if (!holdId) return res.status(400).json({ error: "holdId is required." });

    let appointmentId;
    let doctorUserId, doctorName, patientEmail, doctorEmail, patientName, date, startTime, endTime, doctorProfileId, patientId;

    const tx = db.transaction(() => {
      const hold = db.prepare(`SELECT * FROM slot_holds WHERE id = ? AND held_by_patient_id = ?`).get(holdId, req.user.id);
      if (!hold) { const e = new Error("Hold not found or does not belong to you."); e.status = 404; throw e; }
      if (new Date(hold.expires_at + "Z") < new Date()) { const e = new Error("Your slot hold expired. Please pick a slot again."); e.status = 410; throw e; }

      const conflict = db.prepare(`
        SELECT 1 FROM appointments WHERE doctor_id = ? AND date = ? AND start_time = ?
        AND status NOT IN ('cancelled','cancelled_by_leave')
      `).get(hold.doctor_id, hold.date, hold.start_time);
      if (conflict) { const e = new Error("That slot was just taken by someone else. Please pick another time."); e.status = 409; throw e; }

      const doctor = db.prepare(`
        SELECT dp.id as doctor_profile_id, dp.slot_duration_minutes, u.id as user_id, u.name, u.email
        FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id WHERE dp.id = ?
      `).get(hold.doctor_id);
      const patient = db.prepare(`SELECT id, name, email FROM users WHERE id = ?`).get(req.user.id);

      const [h, m] = hold.start_time.split(":").map(Number);
      const endTotal = h * 60 + m + doctor.slot_duration_minutes;
      const computedEnd = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

      appointmentId = uuid();
      db.prepare(`
        INSERT INTO appointments (id, patient_id, doctor_id, date, start_time, end_time, status, symptoms_text)
        VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)
      `).run(appointmentId, patient.id, doctor.doctor_profile_id, hold.date, hold.start_time, computedEnd, symptomsText || "");

      db.prepare(`DELETE FROM slot_holds WHERE id = ?`).run(holdId);

      doctorUserId = doctor.user_id; doctorProfileId = doctor.doctor_profile_id; doctorName = doctor.name; doctorEmail = doctor.email;
      patientId = patient.id; patientName = patient.name; patientEmail = patient.email;
      date = hold.date; startTime = hold.start_time; endTime = computedEnd;
    });
    tx();

    // ---- Best-effort side effects (never allowed to break the booking) ----

    generatePreVisitSummary(symptomsText || "").then((summary) => {
      db.prepare(`
        UPDATE appointments SET pre_visit_summary_json = ?, urgency = ?, updated_at = datetime('now') WHERE id = ?
      `).run(JSON.stringify(summary), summary.urgency, appointmentId);
    }).catch((err) => console.error("[appointments] pre-visit summary generation failed:", err));

    const patientTpl = bookingConfirmationEmail({ recipientName: patientName, otherPartyName: doctorName, date, startTime, forRole: "patient" });
    queueNotification({ appointmentId, type: "booking_confirmation", recipientEmail: patientEmail, subject: patientTpl.subject, body: patientTpl.body });

    const doctorTpl = bookingConfirmationEmail({ recipientName: `Dr. ${doctorName}`, otherPartyName: patientName, date, startTime, forRole: "doctor" });
    queueNotification({ appointmentId, type: "booking_confirmation", recipientEmail: doctorEmail, subject: doctorTpl.subject, body: doctorTpl.body });

    calendarService.createEventForUser({
      userId: patientId, summary: `Appointment with Dr. ${doctorName}`,
      description: "Booked via City Clinic", date, startTime, endTime
    }).then((eid) => eid && db.prepare(`UPDATE appointments SET calendar_event_id_patient = ? WHERE id = ?`).run(eid, appointmentId))
      .catch((err) => console.warn("[appointments] calendar create (patient) failed:", err.message));

    calendarService.createEventForUser({
      userId: doctorUserId, summary: `Appointment with ${patientName}`,
      description: "Booked via City Clinic", date, startTime, endTime
    }).then((eid) => eid && db.prepare(`UPDATE appointments SET calendar_event_id_doctor = ? WHERE id = ?`).run(eid, appointmentId))
      .catch((err) => console.warn("[appointments] calendar create (doctor) failed:", err.message));

    res.status(201).json({ appointmentId, date, startTime, endTime, doctorName, patientName });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/mine", (req, res, next) => {
  try {
    let rows;
    if (req.user.role === "patient") {
      rows = db.prepare(`
        SELECT a.*, u.name as doctor_name, dp.specialization
        FROM appointments a
        JOIN doctor_profiles dp ON dp.id = a.doctor_id
        JOIN users u ON u.id = dp.user_id
        WHERE a.patient_id = ? ORDER BY a.date DESC, a.start_time DESC
      `).all(req.user.id);
    } else if (req.user.role === "doctor") {
      const profile = db.prepare("SELECT id FROM doctor_profiles WHERE user_id = ?").get(req.user.id);
      rows = profile ? db.prepare(`
        SELECT a.*, p.name as patient_name, p.email as patient_email
        FROM appointments a JOIN users p ON p.id = a.patient_id
        WHERE a.doctor_id = ? ORDER BY a.date DESC, a.start_time DESC
      `).all(profile.id) : [];
    } else {
      return res.status(403).json({ error: "Admins should use /api/admin endpoints." });
    }

    res.json(rows.map((r) => ({
      ...r,
      pre_visit_summary: r.pre_visit_summary_json ? JSON.parse(r.pre_visit_summary_json) : null,
      prescription: r.prescription_json ? JSON.parse(r.prescription_json) : null,
      post_visit_summary: r.post_visit_summary_json ? JSON.parse(r.post_visit_summary_json) : null
    })));
  } catch (err) { next(err); }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id);
    if (!appt) return res.status(404).json({ error: "Appointment not found." });

    const isPatientOwner = req.user.role === "patient" && appt.patient_id === req.user.id;
    const doctorProfile = req.user.role === "doctor" ? db.prepare("SELECT id FROM doctor_profiles WHERE user_id = ?").get(req.user.id) : null;
    const isDoctorOwner = doctorProfile && appt.doctor_id === doctorProfile.id;
    if (!isPatientOwner && !isDoctorOwner && req.user.role !== "admin") {
      return res.status(403).json({ error: "You can only cancel your own appointments." });
    }
    if (appt.status !== "confirmed") return res.status(400).json({ error: `Appointment is already ${appt.status}.` });

    db.prepare(`UPDATE appointments SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(appt.id);

    const patient = db.prepare("SELECT name, email FROM users WHERE id = ?").get(appt.patient_id);
    const doctor = db.prepare(`
      SELECT u.name, u.email, u.id as user_id FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id WHERE dp.id = ?
    `).get(appt.doctor_id);

    const patientTpl = cancellationEmail({ recipientName: patient.name, otherPartyName: `Dr. ${doctor.name}`, date: appt.date, startTime: appt.start_time });
    queueNotification({ appointmentId: appt.id, type: "cancellation", recipientEmail: patient.email, subject: patientTpl.subject, body: patientTpl.body });
    const doctorTpl = cancellationEmail({ recipientName: `Dr. ${doctor.name}`, otherPartyName: patient.name, date: appt.date, startTime: appt.start_time });
    queueNotification({ appointmentId: appt.id, type: "cancellation", recipientEmail: doctor.email, subject: doctorTpl.subject, body: doctorTpl.body });

    calendarService.deleteEventForUser({ userId: appt.patient_id, eventId: appt.calendar_event_id_patient }).catch(() => {});
    calendarService.deleteEventForUser({ userId: doctor.user_id, eventId: appt.calendar_event_id_doctor }).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
