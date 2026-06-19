// i18n foundation for the Intero front-end.
//
// One place owns the supported languages, the active-locale resolution and the
// switch mechanism. UI strings are translated at runtime via svelte-i18n's
// reactive `$_()` store; mock data (which is fetched-and-cached) is re-loaded
// for the chosen language by reloading the page on switch — see setLocale().
//
// Adding a language later is two steps: add its code to LOCALES, and drop in
// `locales/<code>.json` (UI) + `lib/mock/content/<code>.js` (mock data).

import { addMessages, init, locale as svelteLocale } from "svelte-i18n";

import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import nl from "./locales/nl.json";

// Supported languages, shown in the settings panel in this order. `label` is the
// autonym (each language in its own name) so a user always recognises their own
// — intentionally NOT translated.
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "nl", label: "Nederlands" },
];

export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "intero.locale";

// BCP-47 tag per locale for Intl date/number formatting (month names, weekday
// names, date order). English maps to en-GB to keep the DD Mon YYYY order.
const LOCALE_TAGS = { en: "en-GB", de: "de-DE", fr: "fr-FR", nl: "nl-NL" };

const SUPPORTED = new Set(LOCALES.map((l) => l.code));

// Resolve the active locale once, synchronously, before anything renders or the
// mock layer loads. Reads the persisted choice, falls back to English. Pure
// enough to call from module scope (mock content packs read it at import time).
export function getInitialLocale() {
  let stored = null;
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // localStorage unavailable (SSR/tests) — fall through to default.
  }
  return stored && SUPPORTED.has(stored) ? stored : DEFAULT_LOCALE;
}

// The locale every module sees for this page load. Constant for the load because
// switching reloads the page (so the mock layer can pick the matching data set).
export const ACTIVE_LOCALE = getInitialLocale();

// BCP-47 tag for the active locale — used by Intl-based date formatting.
export const LOCALE_TAG = LOCALE_TAGS[ACTIVE_LOCALE] || LOCALE_TAGS[DEFAULT_LOCALE];

// Register all catalogs eagerly (they are small JSON) and init synchronously, so
// there is never a flash of untranslated keys. fallbackLocale fills any gap with
// English.
addMessages("en", en);
addMessages("de", de);
addMessages("fr", fr);
addMessages("nl", nl);

init({ fallbackLocale: DEFAULT_LOCALE, initialLocale: ACTIVE_LOCALE });

// Switch language: persist the choice and reload so BOTH the UI and the
// fetched-and-cached mock data come back in the new language with no stale
// state. No-op when the chosen locale is already active.
export function setLocale(code) {
  if (!SUPPORTED.has(code) || code === ACTIVE_LOCALE) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // Best effort: still switch for this session even if persistence fails.
    svelteLocale.set(code);
  }
  if (typeof window !== "undefined") window.location.reload();
}
