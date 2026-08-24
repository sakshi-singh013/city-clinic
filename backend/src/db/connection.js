const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || "./data/clinic.db";
const resolved = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new Database(resolved);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = db;
