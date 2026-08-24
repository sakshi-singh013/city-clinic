require("dotenv").config();
const initDb = require("./init");
const seed = require("./seed");

initDb();
seed();
process.exit(0);
