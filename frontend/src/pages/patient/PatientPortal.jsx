import React, { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client.js";
import { StatusPulse } from "../../components/Pulse.jsx";
import UrgencyBadge from "../../components/UrgencyBadge.jsx";
import CalendarConnect from "../../components/CalendarConnect.jsx";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PatientPortal() {
  const [tab, setTab] = useState("book");
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-8">
        <TabButton active={tab === "book"} onClick={() => setTab("book")}>Book appointment</TabButton>
               <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>My appointments</TabButton>
      </div>
      <CalendarConnect />
      {tab === "book" ? <BookFlow onBooked={() => setTab("mine")} /> : <MyAppointments />}
    </div>
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-card text-sm font-semibold border ${
        active ? "bg-ink text-paper border-ink" : "bg-white text-ink/60 border-line hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------- Booking flow ----------------

function BookFlow({ onBooked }) {
  const [specializations, setSpecializations] = useState([]);
  const [specialization, setSpecialization] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState(null);
  const [onLeave, setOnLeave] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hold, setHold] = useState(null);
  const [symptoms, setSymptoms] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    api.get("/patient/specializations").then(setSpecializations).catch(() => {});
  }, []);

  useEffect(() => {
    api.get(`/patient/doctors${specialization ? `?specialization=${encodeURIComponent(specialization)}` : ""}`)
      .then(setDoctors).catch(() => {});
    setDoctorId("");
  }, [specialization]);

  const loadSlots = useCallback(() => {
    if (!doctorId || !date) return;
    setSlots(null);
    setSelectedSlot(null);
    api.get(`/patient/doctors/${doctorId}/slots?date=${date}`)
      .then((data) => { setSlots(data.available); setOnLeave(data.on_leave); })
      .catch((err) => setError(err.message));
  }, [doctorId, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const pickSlot = async (slot) => {
    setError("");
    setSelectedSlot(slot);
    try {
      const res = await api.post("/appointments/hold", {
        doctorId, date, startTime: slot.start_time, endTime: slot.end_time
      });
      setHold(res);
    } catch (err) {
      setError(err.message);
      setSelectedSlot(null);
      loadSlots();
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/appointments/confirm", { holdId: hold.holdId, symptomsText: symptoms });
      setConfirmed(res);
    } catch (err) {
      setError(err.message);
      setHold(null);
      setSelectedSlot(null);
      loadSlots();
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-pulse-soft flex items-center justify-center mb-4">
          <span className="h-3 w-3 rounded-full bg-pulse" />
        </div>
        <h2 className="font-display text-2xl font-semibold mb-2">Appointment confirmed</h2>
        <p className="text-ink/60 mb-6">
          {confirmed.doctorName} · {confirmed.date} at {confirmed.startTime}
        </p>
        <button className="btn-primary" onClick={onBooked}>View my appointments</button>
      </div>
    );
  }

  if (hold) {
    return (
      <form onSubmit={confirm} className="card p-6 space-y-5">
        <div>
          <p className="eyebrow mb-1">Confirming slot</p>
          <p className="font-display text-xl font-semibold">{date} at {selectedSlot.start_time}–{selectedSlot.end_time}</p>
          <p className="text-xs text-ink/50 mt-1">Held for you — this will expire in a few minutes if not confirmed.</p>
        </div>
        <div>
          <label className="label">Tell us your symptoms</label>
          <textarea
            className="input min-h-[120px]"
            required
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="E.g. Dry cough for 3 days, mild fever in the evenings, no shortness of breath..."
          />
          <p className="text-xs text-ink/40 mt-1.5">This goes straight to your doctor as an AI-drafted pre-visit brief.</p>
        </div>
        {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
        <div className="flex gap-3">
          <button type="button" className="btn-secondary" onClick={() => { setHold(null); setSelectedSlot(null); loadSlots(); }}>Back</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Confirming…" : "Confirm appointment"}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 grid sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Specialization</label>
          <select className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)}>
            <option value="">All</option>
            {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Doctor</label>
          <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">Choose a doctor</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}

      {doctorId && (
        <div className="card p-6">
          <p className="eyebrow mb-3">Available slots</p>
          {onLeave ? (
            <p className="text-sm text-ink/60">The doctor is unavailable on this date. Try another day.</p>
          ) : slots === null ? (
            <p className="text-sm text-ink/40">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-ink/60">No open slots on this date. Try another day.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s.start_time}
                  onClick={() => pickSlot(s)}
                  className="px-3 py-2 rounded-card border border-line text-sm font-mono hover:border-pulse hover:bg-pulse-soft transition-colors"
                >
                  {s.start_time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- My appointments ----------------

function MyAppointments() {
  const [appointments, setAppointments] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.get("/appointments/mine").then(setAppointments).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!confirm("Cancel this appointment?")) return;
    try {
      await api.post(`/appointments/${id}/cancel`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>;
  if (!appointments) return <p className="text-sm text-ink/40">Loading…</p>;
  if (appointments.length === 0) return <p className="text-sm text-ink/60">No appointments yet.</p>;

  return (
    <div className="space-y-4">
      {appointments.map((a) => (
        <div key={a.id} className="card p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="font-display text-lg font-semibold">{a.doctor_name} <span className="text-ink/40 font-sans text-sm font-normal">· {a.specialization}</span></p>
              <p className="text-sm text-ink/60 font-mono">{a.date} · {a.start_time}–{a.end_time}</p>
            </div>
            <div className="flex items-center gap-2">
              {a.pre_visit_summary && <UrgencyBadge level={a.urgency} />}
              {a.status === "confirmed" && (
                <button onClick={() => cancel(a.id)} className="btn-danger text-xs px-3 py-1.5">Cancel</button>
              )}
            </div>
          </div>

          <StatusPulse appointment={a} />

          {a.pre_visit_summary && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-ink/70">Pre-visit summary {a.pre_visit_summary.source === "fallback" && <span className="text-ink/30 font-normal">(auto-generated, no AI key configured)</span>}</summary>
              <div className="mt-2 pl-3 border-l-2 border-line space-y-1 text-ink/60">
                <p><strong className="text-ink/80">Chief complaint:</strong> {a.pre_visit_summary.chief_complaint}</p>
                <p><strong className="text-ink/80">Suggested questions:</strong></p>
                <ul className="list-disc pl-5">
                  {a.pre_visit_summary.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            </details>
          )}

          {a.post_visit_summary && (
            <details className="mt-3 text-sm" open>
              <summary className="cursor-pointer font-medium text-ink/70">Visit summary</summary>
              <div className="mt-2 pl-3 border-l-2 border-pulse/40 space-y-2 text-ink/60">
                <p>{a.post_visit_summary.summary}</p>
                {a.post_visit_summary.medication_schedule?.length > 0 && (
                  <div>
                    <strong className="text-ink/80">Medication schedule:</strong>
                    <ul className="list-disc pl-5">
                      {a.post_visit_summary.medication_schedule.map((m, i) => <li key={i}>{m.medication}: {m.instructions}</li>)}
                    </ul>
                  </div>
                )}
                {a.post_visit_summary.follow_up_steps?.length > 0 && (
                  <div>
                    <strong className="text-ink/80">Follow-up steps:</strong>
                    <ul className="list-disc pl-5">
                      {a.post_visit_summary.follow_up_steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
