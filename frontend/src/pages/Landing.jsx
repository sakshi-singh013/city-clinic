import React from "react";
import { Link } from "react-router-dom";
import { EkgLine } from "../components/Pulse.jsx";

export default function Landing() {
  return (
    <div>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <p className="eyebrow mb-4">City Clinic · Appointment &amp; Follow-up Manager</p>
        <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
          Every visit, traced from
          <span className="text-pulse"> first symptom</span> to
          <span className="text-pulse"> full recovery</span>.
        </h1>
        <p className="mt-6 text-ink/60 max-w-xl text-lg">
          Patients describe symptoms before they arrive. Doctors get an AI-drafted
          brief instead of a blank chart. Everyone gets a calendar invite and an
          email that actually arrives.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="btn-primary px-6 py-3 text-sm">Book as a patient</Link>
          <Link to="/login" className="btn-secondary px-6 py-3 text-sm">Doctor / admin login</Link>
        </div>
      </section>

      <div className="w-full overflow-hidden border-y border-line bg-white">
        <EkgLine repeat={20} className="w-full h-16 text-pulse/70" strokeWidth={2} animate />
      </div>

      <section className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-3 gap-6">
        {[
          {
            eyebrow: "Before the visit",
            title: "Symptoms in, urgency out",
            body: "Patients fill a short symptom form on booking. An AI pass returns an urgency level, chief complaint, and three questions worth asking — waiting in the doctor's queue before the patient sits down."
          },
          {
            eyebrow: "During booking",
            title: "No double-bookings, ever",
            body: "Slots are held the instant they're picked and confirmed inside a database transaction with a hard uniqueness constraint underneath it. Two patients can't land the same chair."
          },
          {
            eyebrow: "After the visit",
            title: "Notes, translated",
            body: "Clinical notes become a plain-language summary with a medication schedule and follow-up steps — emailed to the patient, with reminders timed to their prescription."
          }
        ].map((f) => (
          <div key={f.title} className="card p-6">
            <p className="eyebrow mb-3">{f.eyebrow}</p>
            <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
            <p className="text-sm text-ink/60 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
