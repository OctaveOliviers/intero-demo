// Lightweight active-locale → BCP-47 tag resolver for Intl date/number
// formatting. Deliberately free of svelte-i18n and JSON imports so it is safe
// to import from helpers that run under `node --test` (no init, no catalogs).

const TAGS = { en: "en-GB", de: "de-DE", fr: "fr-FR", nl: "nl-NL" };

export function resolveLocaleTag() {
  let stored = null;
  try {
    stored = localStorage.getItem("intero.locale");
  } catch {
    // No localStorage (tests/SSR) — fall back to English.
  }
  return TAGS[stored] || TAGS.en;
}

// Localized month/weekday name arrays built once from the active tag.
export function monthNames(format = "short") {
  const fmt = new Intl.DateTimeFormat(resolveLocaleTag(), { month: format, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2021, i, 1))));
}

// Monday-first weekday labels, trimmed to `length` chars (default 2 to match the
// calendar's compact "Mo/Tu/We" look).
export function weekdayNames(format = "short", length = 2) {
  const fmt = new Intl.DateTimeFormat(resolveLocaleTag(), { weekday: format, timeZone: "UTC" });
  // 2021-03-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const name = fmt.format(new Date(Date.UTC(2021, 2, 1 + i)));
    return length ? name.slice(0, length) : name;
  });
}
