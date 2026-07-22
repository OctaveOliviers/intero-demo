import test from "node:test";
import assert from "node:assert/strict";

import { createThreadMessageKeyer } from "./threadMessageKey.js";

test("explicit message ids stay stable across replacement objects", () => {
  const keyFor = createThreadMessageKeyer();
  const first = keyFor({ id: "msg-1", role: "user", content: "same" });
  const replacement = keyFor({ id: "msg-1", role: "user", content: "same" });
  assert.equal(first, replacement);
});

test("id-less duplicate message objects get distinct stable local keys", () => {
  const keyFor = createThreadMessageKeyer();
  const a = { role: "user", content: "repeat", created_at: "2026-06-27T00:00:00Z" };
  const b = { role: "user", content: "repeat", created_at: "2026-06-27T00:00:00Z" };

  assert.equal(keyFor(a), keyFor(a), "same object keeps its local key");
  assert.notEqual(keyFor(a), keyFor(b), "duplicate objects do not collide");
});
