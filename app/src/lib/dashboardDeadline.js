// Dashboard/audit submission-deadline display (spec §7.1, "Deadline display (date OR cadence)").
// `submissionDeadline` is either an ISO date or a free-text cadence string
// (e.g. "Submit ≤25 days of discharge") shown verbatim.
import { getDeadlineSubtitle } from "./deadlineSubtitle.js";
import { LOCALE_TAG } from "../i18n/index.js";

// Full localized deadline SENTENCE (countdown-aware for dates, verbatim cadence
// otherwise) — used by the audit-page subtitle.
export function dashboardDeadlineText(submissionDeadline) {
  if (!submissionDeadline) return null;
  const subtitle = getDeadlineSubtitle(submissionDeadline);
  if (subtitle && subtitle.text) return subtitle.text;
  return String(submissionDeadline);
}

// Bare deadline VALUE (no label): a formatted date for an ISO date, else the
// verbatim cadence string. The card adds the "Submission deadline:" label once,
// so this carries no prefix (fixes the doubled "submission deadline:").
export function dashboardDeadlineValue(submissionDeadline) {
  if (!submissionDeadline) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(submissionDeadline).trim());
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Intl.DateTimeFormat(LOCALE_TAG, {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  }
  return String(submissionDeadline);
}
