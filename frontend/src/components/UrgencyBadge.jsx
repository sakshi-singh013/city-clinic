import React from "react";

const STYLES = {
  Low: "bg-pulse-soft text-pulse-dark",
  Medium: "bg-gold-soft text-gold",
  High: "bg-alert-soft text-alert"
};

export default function UrgencyBadge({ level }) {
  if (!level) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[level] || STYLES.Low}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${level === "High" ? "bg-alert" : level === "Medium" ? "bg-gold" : "bg-pulse"}`} />
      {level} urgency
    </span>
  );
}
