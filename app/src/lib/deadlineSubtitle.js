// Pure deadline subtitle logic for Results top-band rendering.
// Input: template deadline date + optional now override.
// Output: { mode, text } | null

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const text = String(value).trim();
  if (!text) return null;

  // Deterministic parse for YYYY-MM-DD, independent of local timezone.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo, d));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateUtc(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getDeadlineSubtitle(deadlineDate, now = new Date()) {
  const deadline = toUtcDateOnly(deadlineDate);
  if (!deadline) return null;

  const today = toUtcDateOnly(now);
  if (!today) return null;

  const daysUntil = Math.floor((deadline.getTime() - today.getTime()) / DAY_MS);
  if (daysUntil === 0) {
    return { mode: "today", text: "submission due today" };
  }
  if (daysUntil > 0 && daysUntil <= 10) {
    return {
      mode: "countdown",
      text: `${daysUntil} day${daysUntil === 1 ? "" : "s"} until submission`,
    };
  }

  return { mode: "date", text: `submission deadline: ${formatDateUtc(deadline)}` };
}
