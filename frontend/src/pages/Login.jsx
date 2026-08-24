import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "patient" ? "/patient" : user.role === "doctor" ? "/doctor" : "/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <p className="eyebrow mb-2">Sign in</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Welcome back</h1>

      <form onSubmit={submit} className="card p-6 space-y-4">
        {error && <div className="text-sm text-alert bg-alert-soft rounded-card px-3 py-2">{error}</div>}
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>

      <div className="mt-6 text-sm text-ink/60 space-y-2">
        <p>New patient? <Link to="/register" className="text-pulse font-medium">Create an account</Link></p>
        <div className="card p-4 text-xs font-mono leading-relaxed text-ink/50">
          Demo logins (password: Password123!)<br />
          admin@clinic.test · ananya.rao@clinic.test · patient@clinic.test
        </div>
      </div>
    </div>
  );
}
