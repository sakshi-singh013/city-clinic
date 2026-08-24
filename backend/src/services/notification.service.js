const { v4: uuid } = require("uuid");
const db = require("../db/connection");
const { sendEmail } = require("./email.service");

const MAX_ATTEMPTS = 5;

/**
 * Every outbound email is written to the `notifications` table FIRST
 * (status='pending'), then a background job actually sends it and marks
 * it sent/failed with a retry count. This means booking, cancellation and
 * reminder emails survive a transient SMTP outage or process restart -
 * nothing is lost, it just retries on the next tick.
 */
function queueNotification({ appointmentId = null, type, recipientEmail, subject, body, scheduledAt = null }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO notifications (id, appointment_id, type, recipient_email, subject, body, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `).run(id, appointmentId, type, recipientEmail, subject, body, scheduledAt);
  return id;
}

async function processQueue(limit = 25) {
  const due = db.prepare(`
    SELECT * FROM notifications
    WHERE status IN ('pending','failed')
      AND attempts < ?
      AND scheduled_at <= datetime('now')
    ORDER BY scheduled_at ASC
    LIMIT ?
  `).all(MAX_ATTEMPTS, limit);

  for (const n of due) {
    try {
      await sendEmail({ to: n.recipient_email, subject: n.subject, html: n.body });
      db.prepare(`UPDATE notifications SET status='sent', sent_at=datetime('now'), attempts=attempts+1 WHERE id=?`).run(n.id);
    } catch (err) {
      const attempts = n.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      // Simple backoff: push retry a few minutes further out each attempt.
      const backoffMinutes = Math.min(30, attempts * 5);
      db.prepare(`
        UPDATE notifications
        SET status=?, attempts=?, last_error=?, scheduled_at=datetime('now', '+' || ? || ' minutes')
        WHERE id=?
      `).run(status, attempts, String(err.message).slice(0, 500), backoffMinutes, n.id);
      console.warn(`[notification.service] send failed for ${n.id} (attempt ${attempts}):`, err.message);
    }
  }

  return due.length;
}

// ---- Templates ----

function bookingConfirmationEmail({ recipientName, otherPartyName, date, startTime, forRole }) {
  return {
    subject: `Appointment confirmed - ${date} ${startTime}`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Appointment confirmed</h2>
        <p>Hi ${recipientName},</p>
        <p>Your appointment with ${forRole === "patient" ? "Dr. " : ""}${otherPartyName} on
        <strong>${date} at ${startTime}</strong> is confirmed.</p>
        <p>You'll also find this on your Google Calendar if you've connected it.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

function cancellationEmail({ recipientName, otherPartyName, date, startTime, reason }) {
  return {
    subject: `Appointment cancelled - ${date} ${startTime}`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Appointment cancelled</h2>
        <p>Hi ${recipientName},</p>
        <p>Your appointment with ${otherPartyName} on <strong>${date} at ${startTime}</strong> has been cancelled.
        ${reason ? `Reason: ${reason}` : ""}</p>
        <p>Please log in to book a new slot.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

function leaveNoticeEmail({ recipientName, doctorName, date, startTime }) {
  return {
    subject: `Your doctor is unavailable on ${date} - please reschedule`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Your appointment needs to be rescheduled</h2>
        <p>Hi ${recipientName},</p>
        <p>Dr. ${doctorName} has marked ${date} as unavailable, which affects your
        <strong>${startTime}</strong> appointment. We're sorry for the inconvenience.</p>
        <p>Please log in to pick a new slot - your symptom notes have been saved.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

function reminderEmail({ recipientName, otherPartyName, date, startTime }) {
  return {
    subject: `Reminder: appointment tomorrow at ${startTime}`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Appointment reminder</h2>
        <p>Hi ${recipientName},</p>
        <p>This is a reminder of your appointment with ${otherPartyName} on
        <strong>${date} at ${startTime}</strong>.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

function medicationReminderEmail({ recipientName, medicationName, dosage, timeLabel }) {
  return {
    subject: `Medication reminder: ${medicationName}`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Time for your medication</h2>
        <p>Hi ${recipientName},</p>
        <p>It's ${timeLabel} - time to take <strong>${medicationName}</strong> ${dosage ? `(${dosage})` : ""}.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

function postVisitSummaryEmail({ recipientName, doctorName, summaryText }) {
  return {
    subject: `Your visit summary from Dr. ${doctorName}`,
    body: `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Your visit summary</h2>
        <p>Hi ${recipientName},</p>
        <p>${summaryText}</p>
        <p>Log in any time to view your full medication schedule and follow-up steps.</p>
        <p>- City Clinic</p>
      </div>`
  };
}

module.exports = {
  queueNotification,
  processQueue,
  bookingConfirmationEmail,
  cancellationEmail,
  leaveNoticeEmail,
  reminderEmail,
  medicationReminderEmail,
  postVisitSummaryEmail
};
