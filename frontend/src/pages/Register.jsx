import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.phone);
      navigate("/patient");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <p className="eyebrow mb-2">New patient</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Create your account</h1>

      <form onSubmit={submit} className="card p-6 space-y-4">
        {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={form.name} onChange={update("name")} placeholder="Jordan Patel" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={update("email")} placeholder="you@example.com" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={update("phone")} placeholder="Optional" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={8} value={form.password} onChange={update("password")} placeholder="At least 8 characters" />
        </div>
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
      </form>

      <p className="mt-6 text-sm text-ink/60">Already have an account? <Link to="/login" className="text-pulse font-medium">Sign in</Link></p>
    </div>
  );
}
