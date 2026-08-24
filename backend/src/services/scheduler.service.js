const cron = require("node-cron");
const db = require("../db/connection");
const {
  processQueue,
  queueNotification,
  reminderEmail,
  medicationReminderEmail
} = require("./notification.service");

function cleanupExpiredHolds() {
  const result = db.prepare(`DELETE FROM slot_holds WHERE expires_at < datetime('now')`).run();
  if (result.changes) console.log(`[scheduler] cleared ${result.changes} expired slot hold(s)`);
}

// Appointments happening ~24h from now: queue a reminder email once.
function queueAppointmentReminders() {
  const rows = db.prepare(`
    SELECT a.id, a.date, a.start_time, a.patient_id, a.doctor_id,
           p.name as patient_name, p.email as patient_email,
           d.name as doctor_name
    FROM appointments a
    JOIN users p ON p.id = a.patient_id
    JOIN doctor_profiles dp ON dp.id = a.doctor_id
    JOIN users d ON d.id = dp.user_id
    WHERE a.status = 'confirmed'
      AND date(a.date) = date('now', '+1 day')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.appointment_id = a.id AND n.type = 'reminder'
      )
  `).all();

  for (const r of rows) {
    const tpl = reminderEmail({
      recipientName: r.patient_name,
      otherPartyName: `Dr. ${r.doctor_name}`,
      date: r.date,
      startTime: r.start_time
    });
    queueNotification({
      appointmentId: r.id,
      type: "reminder",
      recipientEmail: r.patient_email,
      subject: tpl.subject,
      body: tpl.body
    });
  }
  if (rows.length) console.log(`[scheduler] queued ${rows.length} appointment reminder(s)`);
}

// Medication reminders: for each active prescription, and each scheduled
// time of day, send at most once per day per time-slot. We look this up
// against the notifications table so we don't need extra state columns.
function queueMedicationReminders() {
  const nowRow = db.prepare(`SELECT datetime('now','localtime') as now, date('now','localtime') as today, strftime('%H:%M','now','localtime') as hhmm`).get();
  const active = db.prepare(`
    SELECT mr.*, a.patient_id, p.name as patient_name, p.email as patient_email
    FROM medication_reminders mr
    JOIN appointments a ON a.id = mr.appointment_id
    JOIN users p ON p.id = a.patient_id
    WHERE date(?) BETWEEN mr.start_date AND mr.end_date
  `).all(nowRow.today);

  let queued = 0;
  for (const med of active) {
    const times = JSON.parse(med.reminder_times_json || "[]");
    for (const t of times) {
      const [th, tm] = t.split(":").map(Number);
      const nowMins = Number(nowRow.hhmm.split(":")[0]) * 60 + Number(nowRow.hhmm.split(":")[1]);
      const targetMins = th * 60 + tm;
      // 15-minute firing window
      if (Math.abs(nowMins - targetMins) > 7) continue;

      const alreadySent = db.prepare(`
        SELECT 1 FROM notifications
        WHERE appointment_id = ? AND type = 'medication_reminder'
          AND subject = ? AND date(created_at) = date('now','localtime')
        LIMIT 1
      `).get(med.appointment_id, `Medication reminder: ${med.medication_name}`);
      if (alreadySent) continue;

      const tpl = medicationReminderEmail({
        recipientName: med.patient_name,
        medicationName: med.medication_name,
        dosage: med.dosage,
        timeLabel: t
      });
      queueNotification({
        appointmentId: med.appointment_id,
        type: "medication_reminder",
        recipientEmail: med.patient_email,
        subject: tpl.subject,
        body: tpl.body
      });
      queued += 1;
    }
  }
  if (queued) console.log(`[scheduler] queued ${queued} medication reminder(s)`);
}

function start() {
  // Every minute: release expired slot holds so others can book them.
  cron.schedule("* * * * *", cleanupExpiredHolds);

  // Every 2 minutes: attempt to deliver / retry pending notifications.
  cron.schedule("*/2 * * * *", () => {
    processQueue().catch((err) => console.error("[scheduler] processQueue error:", err));
  });

  // Every 15 minutes: check for medication doses due.
  cron.schedule("*/15 * * * *", queueMedicationReminders);

  // Once an hour: queue next-day appointment reminders.
  cron.schedule("0 * * * *", queueAppointmentReminders);

  console.log("[scheduler] background jobs started (holds cleanup, notification retries, reminders)");
}

module.exports = { start, cleanupExpiredHolds, queueAppointmentReminders, queueMedicationReminders };
