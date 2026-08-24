require("dotenv").config();
const express = require("express");
const cors = require("cors");

const initDb = require("./db/init");
const errorHandler = require("./middleware/errorHandler");
const scheduler = require("./services/scheduler.service");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const patientRoutes = require("./routes/patient.routes");
const doctorRoutes = require("./routes/doctor.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const calendarRoutes = require("./routes/calendar.routes");

initDb();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/calendar", calendarRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  City Clinic API listening on http://localhost:${PORT}`);
  console.log(`  Health check:      http://localhost:${PORT}/api/health\n`);
  scheduler.start();
});
