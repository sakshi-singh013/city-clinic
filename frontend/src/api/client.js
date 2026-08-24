// In local dev, Vite's proxy forwards "/api" to the backend (see vite.config.js).
// In production the frontend and backend are deployed as separate services on
// separate domains, so VITE_API_URL must point at the deployed backend, e.g.
// https://city-clinic-backend.onrender.com/api (set at build time).
const BASE = import.meta.env.VITE_API_URL || "/api";

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = token || localStorage.getItem("cc_token");
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body })
};
