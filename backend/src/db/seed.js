const { v4: uuid } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./connection");

function seed() {
  const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (hasAdmin) {
    console.log("[seed] Demo data already present. Skipping.");
    return { seeded: false };
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, role, name, email, password_hash, phone)
    VALUES (@id, @role, @name, @email, @password_hash, @phone)
  `);
  const insertDoctorProfile = db.prepare(`
    INSERT INTO doctor_profiles (id, user_id, specialization, bio, slot_duration_minutes, working_hours_json)
    VALUES (@id, @user_id, @specialization, @bio, @slot_duration_minutes, @working_hours_json)
  `);

  const defaultHours = JSON.stringify({
    mon: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "13:00" }],
    thu: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
    sat: [{ start: "10:00", end: "13:00" }],
    sun: []
  });

  const pass = bcrypt.hashSync("Password123!", 10);

  const admin = { id: uuid(), role: "admin", name: "Clinic Admin", email: "admin@clinic.test", password_hash: pass, phone: "0000000000" };
  insertUser.run(admin);

  const doctors = [
    { name: "Ananya Rao", email: "ananya.rao@clinic.test", specialization: "General Physician", bio: "12 years in family medicine, focuses on preventive care." },
    { name: "Vikram Nair", email: "vikram.nair@clinic.test", specialization: "Cardiologist", bio: "Interventional cardiology, ex-AIIMS." },
    { name: "Sara Iqbal", email: "sara.iqbal@clinic.test", specialization: "Dermatologist", bio: "Cosmetic and clinical dermatology." },
    { name: "Rohan Mehta", email: "rohan.mehta@clinic.test", specialization: "Pediatrician", bio: "Newborn to teen care, 8 years experience." }
  ];

  for (const d of doctors) {
    const userId = uuid();
    insertUser.run({ id: userId, role: "doctor", name: d.name, email: d.email, password_hash: pass, phone: "0000000000" });
    insertDoctorProfile.run({
      id: uuid(),
      user_id: userId,
      specialization: d.specialization,
      bio: d.bio,
      slot_duration_minutes: 20,
      working_hours_json: defaultHours
    });
  }

  const patient = { id: uuid(), role: "patient", name: "Demo Patient", email: "patient@clinic.test", password_hash: pass, phone: "9999999999" };
  insertUser.run(patient);

  console.log("[seed] Seed complete. Login with password: Password123!");
  console.log("[seed]   Admin:   admin@clinic.test");
  console.log("[seed]   Patient: patient@clinic.test");
  doctors.forEach((d) => console.log(`[seed]   Doctor:  ${d.email} (${d.specialization})`));
  return { seeded: true };
}

module.exports = seed;
