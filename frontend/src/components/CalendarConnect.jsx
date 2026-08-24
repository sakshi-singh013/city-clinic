import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";

export default function CalendarConnect() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/calendar/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status || !status.configured) return null;
  if (status.connected) {
    return (
      <div className="mb-6 flex items-center gap-2 text-sm text-pulse-dark bg-pulse-soft rounded-card px-4 py-2.5 w-fit">
        <span className="h-2 w-2 rounded-full bg-pulse" />
        Google Calendar connected
      </div>
    );
  }

  const connect = async () => {
    try {
      const res = await api.get("/calendar/oauth/start");
      window.location.href = res.url;
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <button onClick={connect} className="btn-secondary mb-6 text-sm">
      Connect Google Calendar
    </button>
  );
}
