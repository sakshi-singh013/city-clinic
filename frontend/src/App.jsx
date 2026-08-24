import React from "react";
import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Protected from "./components/Protected.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import PatientPortal from "./pages/patient/PatientPortal.jsx";
import DoctorPortal from "./pages/doctor/DoctorPortal.jsx";
import AdminPortal from "./pages/admin/AdminPortal.jsx";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/patient"
            element={
              <Protected roles={["patient"]}>
                <PatientPortal />
              </Protected>
            }
          />
          <Route
            path="/doctor"
            element={
              <Protected roles={["doctor"]}>
                <DoctorPortal />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected roles={["admin"]}>
                <AdminPortal />
              </Protected>
            }
          />
        </Routes>
      </main>
      <footer className="border-t border-line py-6">
        <div className="max-w-6xl mx-auto px-6 text-xs text-ink/40 font-mono">
          City Clinic — Appointment &amp; Follow-up Manager
        </div>
      </footer>
    </div>
  );
}
