const { google } = require("googleapis");
const db = require("../db/connection");

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state
  });
}

async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens; // { refresh_token, access_token, ... }
}

function getCalendarClientForUser(userId) {
  const user = db.prepare("SELECT google_refresh_token FROM users WHERE id = ?").get(userId);
  if (!user || !user.google_refresh_token) return null;

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: user.google_refresh_token });
  return google.calendar({ version: "v3", auth: client });
}

/**
 * Creates a calendar event for one user (patient or doctor) if - and only
 * if - Google Calendar is configured at the app level AND that specific
 * user has connected their account. Otherwise it's a silent no-op so the
 * booking flow never breaks for users who haven't connected calendar.
 * Returns the created event id, or null.
 */
async function createEventForUser({ userId, summary, description, date, startTime, endTime }) {
  if (!isConfigured()) return null;
  const calendar = getCalendarClientForUser(userId);
  if (!calendar) return null;

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description,
        start: { dateTime: `${date}T${startTime}:00` },
        end: { dateTime: `${date}T${endTime}:00` }
      }
    });
    return event.data.id;
  } catch (err) {
    console.warn(`[calendar.service] Failed to create event for user ${userId}:`, err.message);
    return null;
  }
}

async function updateEventForUser({ userId, eventId, summary, description, date, startTime, endTime }) {
  if (!isConfigured() || !eventId) return;
  const calendar = getCalendarClientForUser(userId);
  if (!calendar) return;
  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary,
        description,
        start: { dateTime: `${date}T${startTime}:00` },
        end: { dateTime: `${date}T${endTime}:00` }
      }
    });
  } catch (err) {
    console.warn(`[calendar.service] Failed to update event ${eventId}:`, err.message);
  }
}

async function deleteEventForUser({ userId, eventId }) {
  if (!isConfigured() || !eventId) return;
  const calendar = getCalendarClientForUser(userId);
  if (!calendar) return;
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (err) {
    console.warn(`[calendar.service] Failed to delete event ${eventId}:`, err.message);
  }
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCodeForTokens,
  createEventForUser,
  updateEventForUser,
  deleteEventForUser
};
