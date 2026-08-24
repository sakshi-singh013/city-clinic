import React, { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import UrgencyBadge from "../../components/UrgencyBadge.jsx";
import { StatusPulse } from "../../components/Pulse.jsx";
import CalendarConnect from "../../components/CalendarConnect.jsx";

export default function DoctorPortal() {
  const [appointments, setAppointments] = useState(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);

  const load = () => api.get("/doctor/schedule").then(setAppointments).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // Sort High urgency confirmed visits first — this is the whole point of the AI triage.
  const sorted = appointments
    ? [...appointments].sort((a, b) => {
        const order = { High: 0, Medium: 1, Low: 2 };
        const ua = a.urgency ? order[a.urgency] : 3;
        const ub = b.urgency ? order[b.urgency] : 3;
        if (ua !== ub) return ua - ub;
        return a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date);
      })
    : [];

  const active = sorted.find((a) => a.id === activeId);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <p className="eyebrow mb-1">Upcoming visits</p>
            <h1 className="font-display text-3xl font-semibold mb-8">Your schedule</h1>
      <CalendarConnect />

      {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2 mb-4">{error}</div>}
      {!appointments ? (
        <p className="text-sm text-ink/40">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-ink/60">No upcoming appointments.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            {sorted.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                className={`w-full text-left card p-4 transition-colors ${activeId === a.id ? "border-ink" : "hover:border-ink/40"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{a.patient_name}</p>
                    <p className="text-xs text-ink/50 font-mono">{a.date} · {a.start_time}</p>
                  </div>
                  <UrgencyBadge level={a.urgency} />
                </div>
              </button>
            ))}
          </div>

          <div>
            {active ? (
              <VisitPanel key={active.id} appointment={active} onSaved={() => { load(); setActiveId(null); }} />
            ) : (
              <div className="card p-8 text-center text-sm text-ink/50">Select a patient to view their pre-visit brief.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VisitPanel({ appointment, onSaved }) {
  const [notes, setNotes] = useState(appointment.doctor_notes || "");
  const [rx, setRx] = useState([{ name: "", dosage: "", frequency_per_day: 2, duration_days: 5 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const updateRx = (i, key, value) => {
    setRx((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  };
  const addRx = () => setRx((r) => [...r, { name: "", dosage: "", frequency_per_day: 2, duration_days: 5 }]);
  const removeRx = (i) => setRx((r) => r.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cleanRx = rx.filter((r) => r.name.trim());
      const res = await api.post(`/doctor/appointments/${appointment.id}/notes`, { doctorNotes: notes, prescription: cleanRx });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <p className="eyebrow mb-1">Pre-visit brief</p>
        <p className="font-display text-xl font-semibold">{appointment.patient_name}</p>
        <p className="text-xs text-ink/50 font-mono">{appointment.date} · {appointment.start_time}</p>
      </div>

      <StatusPulse appointment={appointment} />

      <div className="rounded-card bg-gold-soft border border-gold/20 p-4 text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-ink/80">AI pre-visit summary</span>
          <UrgencyBadge level={appointment.urgency} />
        </div>
        {appointment.pre_visit_summary ? (
          <>
            <p className="text-ink/70"><strong>Chief complaint:</strong> {appointment.pre_visit_summary.chief_complaint}</p>
            <p className="mt-2 font-medium text-ink/70">Suggested questions:</p>
            <ul className="list-disc pl-5 text-ink/60">
              {appointment.pre_visit_summary.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
            <p className="mt-3 text-xs text-ink/50 italic">Raw symptoms reported: "{appointment.symptoms_text}"</p>
          </>
        ) : (
          <p className="text-ink/50">Still generating — refresh in a moment.</p>
        )}
      </div>

      {result ? (
        <div className="rounded-card bg-pulse-soft border border-pulse/20 p-4 text-sm space-y-2">
          <p className="font-semibold text-pulse-dark">Visit completed — patient-friendly summary sent</p>
          <p className="text-ink/70">{result.post_visit_summary.summary}</p>
          {result.medications_scheduled > 0 && (
            <p className="text-ink/60">{result.medications_scheduled} medication reminder schedule(s) created.</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Clinical notes</label>
            <textarea className="input min-h-[100px]" required value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Diagnosis, findings, advice given..." />
          </div>

          <div>
            <label className="label">Prescription</label>
            <div className="space-y-2">
              {rx.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className="input col-span-4" placeholder="Medicine" value={row.name} onChange={(e) => updateRx(i, "name", e.target.value)} />
                  <input className="input col-span-3" placeholder="Dosage" value={row.dosage} onChange={(e) => updateRx(i, "dosage", e.target.value)} />
                  <input className="input col-span-2" type="number" min={1} max={6} placeholder="x/day" value={row.frequency_per_day} onChange={(e) => updateRx(i, "frequency_per_day", e.target.value)} />
                  <input className="input col-span-2" type="number" min={1} placeholder="days" value={row.duration_days} onChange={(e) => updateRx(i, "duration_days", e.target.value)} />
                  <button type="button" onClick={() => removeRx(i)} className="col-span-1 text-ink/30 hover:text-alert text-sm">✕</button>
                </div>
              ))}
              <button type="button" onClick={addRx} className="text-xs font-medium text-pulse">+ Add medicine</button>
            </div>
          </div>

          {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
          <button className="btn-primary w-full" disabled={loading}>{loading ? "Generating summary…" : "Complete visit"}</button>
        </form>
      )}
    </div>
  );
}
