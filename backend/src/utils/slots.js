const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Generate all candidate slot start times for a doctor on a given date,
 * based on their working hours for that day of week and slot duration.
 * Does NOT check bookings/holds/leave - caller filters those out.
 */
function generateCandidateSlots(workingHours, dateStr, slotDurationMinutes) {
  const date = new Date(dateStr + "T00:00:00");
  const dayKey = DAY_KEYS[date.getDay()];
  const ranges = workingHours[dayKey] || [];
  const slots = [];

  for (const range of ranges) {
    let cursor = toMinutes(range.start);
    const end = toMinutes(range.end);
    while (cursor + slotDurationMinutes <= end) {
      const start = toHHMM(cursor);
      const slotEnd = toHHMM(cursor + slotDurationMinutes);
      slots.push({ start_time: start, end_time: slotEnd });
      cursor += slotDurationMinutes;
    }
  }
  return slots;
}

module.exports = { generateCandidateSlots, toMinutes, toHHMM, DAY_KEYS };
