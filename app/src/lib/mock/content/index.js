// Locale-selected mock content pack.
//
// The mock data layer (src/lib/mockData.js) and template catalog
// (src/lib/templateCatalog.js) read every human-readable string from CONTENT,
// so switching the active locale switches the demo's language with no logic
// change. English is the source-of-truth shape; translated packs mirror it.
//
// Registering a new language is one line: add its import and a packs entry.
import en from "./en.js";
import de from "./de.js";
import fr from "./fr.js";
import nl from "./nl.js";

const packs = { en, de, fr, nl };

// Resolve the active locale the same way i18n/index.js does (persisted choice,
// fall back to English). The canonical resolver is i18n/index.js's
// ACTIVE_LOCALE, but importing that module pulls in svelte-i18n and the locale
// JSON catalogs, which the pure mock-data layer (and its node --test suite)
// must not depend on. We mirror its resolution here so the selected pack is
// always identical to the UI locale. The choice is constant per page load
// because switching reloads the page (see i18n/index.js setLocale).
const LOCALE_STORAGE_KEY = "intero.locale";
const DEFAULT_LOCALE = "en";

function activeLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && packs[stored]) return stored;
  } catch {
    // localStorage unavailable (SSR/tests) — fall through to default.
  }
  return DEFAULT_LOCALE;
}

export const CONTENT = packs[activeLocale()] || en;
