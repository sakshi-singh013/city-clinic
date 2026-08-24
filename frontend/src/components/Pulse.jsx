import React from "react";

/**
 * The signature visual for City Clinic: an EKG trace. It's not decoration -
 * it is literally how the product visualizes an appointment moving through
 * its real lifecycle (booked -> pre-visit summary ready -> visit complete ->
 * summary sent), the way a monitor traces a heartbeat.
 */

// A single stylized heartbeat waveform segment, repeated to fill a line.
// Points are relative offsets within one BEAT_WIDTH-wide segment.
const BEAT_POINTS = [
  [0, 20], [18, 20], [24, 6], [30, 34], [36, 20], [54, 20]
];
const BEAT_WIDTH = 54;

export function EkgLine({ repeat = 12, className = "", color = "currentColor", strokeWidth = 2, animate = false }) {
  const width = BEAT_WIDTH * repeat;
  const commands = [];
  for (let i = 0; i < repeat; i++) {
    for (const [x, y] of BEAT_POINTS) {
      commands.push(`${commands.length === 0 ? "M" : "L"}${x + i * BEAT_WIDTH},${y}`);
    }
  }
  const d = commands.join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "pulse-draw" : ""}
      />
    </svg>
  );
}

const STAGES = [
  { key: "booked", label: "Booked" },
  { key: "previsit", label: "Pre-visit summary" },
  { key: "completed", label: "Visit complete" },
  { key: "summary", label: "Summary sent" }
];

export function StatusPulse({ appointment }) {
  if (appointment.status === "cancelled" || appointment.status === "cancelled_by_leave") {
    return (
      <div className="flex items-center gap-2 text-alert text-sm font-medium">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-alert" />
        {appointment.status === "cancelled_by_leave" ? "Cancelled — doctor unavailable" : "Cancelled"}
      </div>
    );
  }

  const reached = {
    booked: true,
    previsit: Boolean(appointment.pre_visit_summary),
    completed: appointment.status === "completed",
    summary: Boolean(appointment.post_visit_summary)
  };
  const activeIndex = STAGES.reduce((acc, s, i) => (reached[s.key] ? i : acc), 0);

  return (
    <div className="w-full">
      <div className="relative h-6">
        <svg viewBox="0 0 300 24" className="w-full h-6" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="12" x2="300" y2="12" stroke="#DCE1DD" strokeWidth="2" />
          <line x1="0" y1="12" x2={(activeIndex / (STAGES.length - 1)) * 300} y2="12" stroke="#0F7A6C" strokeWidth="2" />
        </svg>
        <div className="absolute inset-0 flex justify-between items-center">
          {STAGES.map((s, i) => (
            <span
              key={s.key}
              className={`h-3 w-3 rounded-full border-2 ${
                reached[s.key] ? "bg-pulse border-pulse" : "bg-white border-line"
              }`}
              title={s.label}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-1">
        {STAGES.map((s) => (
          <span key={s.key} className="text-[10px] font-mono uppercase tracking-wide text-ink/40 w-16 text-center first:text-left last:text-right">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
