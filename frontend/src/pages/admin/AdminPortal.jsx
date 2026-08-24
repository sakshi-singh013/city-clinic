import React, { useEffect, useState } from "react";
import { api } from "../../api/client.js";

const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];

export default function AdminPortal() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-8">
        {[["overview", "Overview"], ["doctors", "Doctors"], ["add", "Add doctor"], ["leave", "Leave"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-card text-sm font-semibold border ${
              tab === k ? "bg-ink text-paper border-ink" : "bg-white text-ink/60 border-line hover:border-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "doctors" && <DoctorList />}
      {tab === "add" && <AddDoctor onDone={() => setTab("doctors")} />}
      {tab === "leave" && <LeaveManager />}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/overview").then(setStats).catch(() => {}); }, []);
  if (!stats) return <p className="text-sm text-ink/40">Loading…</p>;
  const cards = [
    ["Patients", stats.patients, "slate"],
    ["Doctors", stats.doctors, "gold"],
    ["Upcoming appointments", stats.upcoming_appointments, "pulse"],
    ["Completed visits", stats.completed_appointments, "pulse"],
    ["Failed notifications", stats.failed_notifications, stats.failed_notifications > 0 ? "alert" : "pulse"]
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {cards.map(([label, value, color]) => (
        <div key={label} className="card p-5">
          <p className="eyebrow mb-2">{label}</p>
          <p className={`font-display text-4xl font-semibold text-${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function DoctorList() {
  const [doctors, setDoctors] = useState(null);
  useEffect(() => { api.get("/admin/doctors").then(setDoctors).catch(() => {}); }, []);
  if (!doctors) return <p className="text-sm text-ink/40">Loading…</p>;
  return (
    <div className="space-y-3">
      {doctors.map((d) => (
        <div key={d.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{d.name}</p>
              <p className="text-sm text-ink/50">{d.specialization} · {d.email}</p>
            </div>
            <span className="font-mono text-xs text-ink/40">{d.slot_duration_minutes} min slots</span>
          </div>
          {d.bio && <p className="text-sm text-ink/60 mt-2">{d.bio}</p>}
        </div>
      ))}
    </div>
  );
}

function AddDoctor({ onDone }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialization: "", bio: "", slot_duration_minutes: 20 });
  const [hours, setHours] = useState(() => Object.fromEntries(DAYS.map(([k]) => [k, { enabled: !["sat", "sun"].includes(k), start: "09:00", end: "17:00" }])));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const working_hours = {};
      for (const [k] of DAYS) {
        working_hours[k] = hours[k].enabled ? [{ start: hours[k].start, end: hours[k].end }] : [];
      }
      const res = await api.post("/admin/doctors", { ...form, working_hours });
      setSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="card p-6">
        <h3 className="font-display text-xl font-semibold mb-2">Doctor profile created</h3>
        <p className="text-sm text-ink/60 mb-4">Share these temporary credentials — the doctor should change their password after first login.</p>
        <div className="font-mono text-sm bg-slate-soft rounded-card p-4 space-y-1">
          <p>Email: {success.doctor.email}</p>
          <p>Temporary password: {success.temporary_password}</p>
        </div>
        <button className="btn-secondary mt-4" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="label">Full name</label><input className="input" required value={form.name} onChange={update("name")} /></div>
        <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={update("email")} /></div>
        <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={update("phone")} /></div>
        <div><label className="label">Specialization</label><input className="input" required value={form.specialization} onChange={update("specialization")} placeholder="e.g. Cardiologist" /></div>
        <div><label className="label">Slot duration (minutes)</label><input className="input" type="number" min={5} value={form.slot_duration_minutes} onChange={update("slot_duration_minutes")} /></div>
      </div>
      <div><label className="label">Bio</label><textarea className="input" value={form.bio} onChange={update("bio")} /></div>

      <div>
        <label className="label">Working hours</label>
        <div className="space-y-2">
          {DAYS.map(([k, label]) => (
            <div key={k} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-20 text-sm">
                <input type="checkbox" checked={hours[k].enabled} onChange={(e) => setHours((h) => ({ ...h, [k]: { ...h[k], enabled: e.target.checked } }))} />
                {label}
              </label>
              {hours[k].enabled && (
                <>
                  <input className="input w-32" type="time" value={hours[k].start} onChange={(e) => setHours((h) => ({ ...h, [k]: { ...h[k], start: e.target.value } }))} />
                  <span className="text-ink/40 text-sm">to</span>
                  <input className="input w-32" type="time" value={hours[k].end} onChange={(e) => setHours((h) => ({ ...h, [k]: { ...h[k], end: e.target.value } }))} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
      <button className="btn-primary" disabled={loading}>{loading ? "Creating…" : "Create doctor profile"}</button>
    </form>
  );
}

function LeaveManager() {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/admin/doctors").then(setDoctors).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setResult(null); setLoading(true);
    try {
      const res = await api.post(`/admin/doctors/${doctorId}/leave`, { date, reason });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 max-w-md">
      <p className="eyebrow">Mark a doctor unavailable</p>
      <p className="text-sm text-ink/60">Any confirmed appointments on that date are automatically cancelled and the affected patients are emailed.</p>
      <div>
        <label className="label">Doctor</label>
        <select className="input" required value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Choose a doctor</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Date</label>
        <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label">Reason (optional)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conference, sick leave, ..." />
      </div>
      {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
      {result && (
        <div className="text-sm text-pulse-dark bg-pulse-soft rounded-card px-3 py-2">
          Leave recorded. {result.affected_appointments} appointment(s) cancelled and patients notified.
        </div>
      )}
      <button className="btn-primary" disabled={loading}>{loading ? "Saving…" : "Mark unavailable"}</button>
    </form>
  );
}
