const express = require("express");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const { sign, verify } = require("../utils/jwt");
const calendarService = require("../services/calendar.service");

const router = express.Router();

router.get("/status", requireAuth("patient", "doctor", "admin"), (req, res) => {
  const user = db.prepare("SELECT google_refresh_token FROM users WHERE id = ?").get(req.user.id);
  res.json({
    configured: calendarService.isConfigured(),
    connected: Boolean(user && user.google_refresh_token)
  });
});

// Kicks off Google's OAuth consent screen. The JWT is embedded in `state`
// (rather than a session cookie) since this is a token-based SPA.
router.get("/oauth/start", requireAuth("patient", "doctor", "admin"), (req, res) => {
  if (!calendarService.isConfigured()) {
    return res.status(400).json({ error: "Google Calendar is not configured on this server. See README." });
  }
  const stateToken = sign({ id: req.user.id });
  res.json({ url: calendarService.getAuthUrl(stateToken) });
});

router.get("/oauth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const payload = verify(state);
    const tokens = await calendarService.exchangeCodeForTokens(code);
    if (tokens.refresh_token) {
      db.prepare("UPDATE users SET google_refresh_token = ? WHERE id = ?").run(tokens.refresh_token, payload.id);
    }
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Google Calendar connected ✅</h2>
        <p>You can close this tab and return to City Clinic.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("[calendar.routes] oauth callback failed:", err);
    res.status(500).send("Something went wrong connecting Google Calendar. Please try again from the app.");
  }
});

module.exports = router;
