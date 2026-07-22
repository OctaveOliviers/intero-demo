// The pure role-gating helper for the admin Settings surface (auth-and-access
// §13; ADR 0003). `admin` sees all three sections incl. the admin-only ones;
// every other role (clinician, agent, null) sees ONLY General, with the admin
// sections ABSENT (not just disabled) — matching the server 403.
import test from "node:test";
import assert from "node:assert/strict";

import {
  visibleSettingsSections,
  canSeeAdminSettings,
  SECTION_GENERAL,
  SECTION_USERS_ROLES,
  SECTION_SOURCE_DATABASES,
} from "./settingsSections.js";

test("admin sees General plus the two admin-only sections", () => {
  const sections = visibleSettingsSections("admin");
  assert.deepEqual(sections, [
    SECTION_GENERAL,
    SECTION_USERS_ROLES,
    SECTION_SOURCE_DATABASES,
  ]);
  assert.equal(canSeeAdminSettings("admin"), true);
});

test("clinician sees ONLY General — admin sections are absent", () => {
  const sections = visibleSettingsSections("clinician");
  assert.deepEqual(sections, [SECTION_GENERAL]);
  assert.ok(!sections.includes(SECTION_USERS_ROLES));
  assert.ok(!sections.includes(SECTION_SOURCE_DATABASES));
  assert.equal(canSeeAdminSettings("clinician"), false);
});

test("agent and null fail closed to General only", () => {
  for (const role of ["agent", null, undefined, "bogus"]) {
    assert.deepEqual(visibleSettingsSections(role), [SECTION_GENERAL]);
    assert.equal(canSeeAdminSettings(role), false);
  }
});
