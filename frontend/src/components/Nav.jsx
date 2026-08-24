import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { EkgLine } from "./Pulse.jsx";

const ROLE_ACCENT = {
  patient: "text-pulse",
  doctor: "text-gold",
  admin: "text-slate"
};

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-line bg-white/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <EkgLine repeat={1} className="h-6 w-9 text-pulse" strokeWidth={2.5} />
          <span className="font-display text-lg font-semibold tracking-tight">City Clinic</span>
        </Link>

        <div className="flex items-center gap-4">
          {user && (
            <span className="hidden sm:inline-flex items-center gap-2 text-sm text-ink/60">
              <span className={`font-mono text-[11px] uppercase tracking-wide ${ROLE_ACCENT[user.role]}`}>{user.role}</span>
              <span className="text-ink/30">/</span>
              {user.name}
            </span>
          )}
          {user ? (
            <button
              className="btn-secondary text-xs px-3 py-2"
              onClick={() => { logout(); navigate("/login"); }}
            >
              Log out
            </button>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="btn-secondary text-xs px-3 py-2">Log in</Link>
              <Link to="/register" className="btn-primary text-xs px-3 py-2">Book as patient</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
