const express = require("express");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const { generateCandidateSlots } = require("../utils/slots");

const router = express.Router();
router.use(requireAuth("patient"));

router.get("/doctors", (req, res, next) => {
  try {
    const { specialization } = req.query;
    let doctors;
    if (specialization) {
      doctors = db.prepare(`
        SELECT dp.id, dp.specialization, dp.bio, dp.slot_duration_minutes, u.name, u.email
        FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
        WHERE dp.specialization LIKE ? ORDER BY u.name
      `).all(`%${specialization}%`);
    } else {
      doctors = db.prepare(`
        SELECT dp.id, dp.specialization, dp.bio, dp.slot_duration_minutes, u.name, u.email
        FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id ORDER BY u.name
      `).all();
    }
    res.json(doctors);
  } catch (err) { next(err); }
});

router.get("/specializations", (req, res, next) => {
  try {
    const rows = db.prepare(`SELECT DISTINCT specialization FROM doctor_profiles ORDER BY specialization`).all();
    res.json(rows.map((r) => r.specialization));
  } catch (err) { next(err); }
});

router.get("/doctors/:id/slots", (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)." });

    const doctor = db.prepare("SELECT * FROM doctor_profiles WHERE id = ?").get(req.params.id);
    if (!doctor) return res.status(404).json({ error: "Doctor not found." });

    const onLeave = db.prepare("SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND date = ?").get(req.params.id, date);
    if (onLeave) return res.json({ available: [], on_leave: true });

    const workingHours = JSON.parse(doctor.working_hours_json);
    const candidates = generateCandidateSlots(workingHours, date, doctor.slot_duration_minutes);

    const taken = new Set(
      db.prepare(`
        SELECT start_time FROM appointments
        WHERE doctor_id = ? AND date = ? AND status NOT IN ('cancelled','cancelled_by_leave')
      `).all(req.params.id, date).map((r) => r.start_time)
    );
    const held = new Set(
      db.prepare(`
        SELECT start_time FROM slot_holds
        WHERE doctor_id = ? AND date = ? AND expires_at > datetime('now')
      `).all(req.params.id, date).map((r) => r.start_time)
    );

    const available = candidates.filter((s) => !taken.has(s.start_time) && !held.has(s.start_time));
    res.json({ available, on_leave: false });
  } catch (err) { next(err); }
});

module.exports = router;
