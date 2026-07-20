// Which Settings sections a role may see — the pure, testable heart of the
// frontend role gate (auth-and-access.md §13; ADR 0003: additive gating).
//
// The admin surface is ADDITIVE and ADMIN-ONLY: every role sees "General"
// (the non-admin language setting), and ONLY an `admin` additionally sees the
// "Users & roles" (IAM) and "Source databases" sections. For a `clinician`
// (and `agent`/null) the admin sections are ABSENT — not disabled — so they are
// never rendered, matching the server `403` on their endpoints (the
// absent-vs-unauthorized seam). This is a convenience layer, never the security
// boundary — the server enforces the same gate.

export const SECTION_GENERAL = "general";
export const SECTION_USERS_ROLES = "usersRoles";
export const SECTION_SOURCE_DATABASES = "sourceDatabases";

// Sections shown to EVERY authenticated role.
const COMMON_SECTIONS = [SECTION_GENERAL];

// Sections shown ONLY to `admin` (the three infra-keyed screens, §13).
const ADMIN_SECTIONS = [SECTION_USERS_ROLES, SECTION_SOURCE_DATABASES];

// Return the ordered list of section ids visible for a role.
// `admin` -> General + the two admin sections; every other role (clinician,
// agent, null/unknown) -> General only. Fail-closed: anything that is not
// exactly "admin" gets the non-admin set.
export function visibleSettingsSections(role) {
  if (role === "admin") return [...COMMON_SECTIONS, ...ADMIN_SECTIONS];
  return [...COMMON_SECTIONS];
}

// Whether a role may see the admin-only sections at all. Used to gate the
// admin sub-nav items and panes so they are absent, not merely hidden.
export function canSeeAdminSettings(role) {
  return role === "admin";
}
