const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const db = require("../db/connection");
const { sign } = require("../utils/jwt");

const router = express.Router();

router.post("/register", (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const id = uuid();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`INSERT INTO users (id, role, name, email, password_hash, phone) VALUES (?, 'patient', ?, ?, ?, ?)`)
      .run(id, name, email.toLowerCase(), hash, phone || null);

    const token = sign({ id, role: "patient", name, email: email.toLowerCase() });
    res.status(201).json({ token, user: { id, role: "patient", name, email: email.toLowerCase() } });
  } catch (err) {
    next(err);
  }
});

router.post("/login", (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase());
    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = sign({ id: user.id, role: user.role, name: user.name, email: user.email });
    res.json({ token, user: { id: user.id, role: user.role, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
