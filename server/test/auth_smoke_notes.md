# Auth Smoke Verification Notes (AUTH-T10)

## Backend smoke command

Run focused auth smoke coverage:

```bash
python3 -m unittest server.test.auth_smoke_test -v
```

This suite now includes session policy checks for:
- non-persistent session cookie (no `Max-Age`/`Expires` on login cookie),
- idle timeout invalidation (30 minutes, server-side),
- hard expiry invalidation (8 hours max lifetime, not extended by activity).

Run migration/idempotence checks for AUTH-T12:

```bash
python3 -m unittest server.test.auth_store_migration_test -v
```

## Frontend-oriented verification (manual, no full e2e)

Use these lightweight checks after starting the app (`make dev-seeded` or equivalent):

1. Open the app with a fresh browser session; confirm login gate appears before data UI.
2. Login with valid credentials; confirm app shell loads and `/api/auth/me` returns 200.
3. Open browser devtools Network tab and trigger an authenticated API call (`/api/sql` or `/api/runs`); confirm request carries cookie and succeeds.
4. Click logout; confirm app returns to login gate.
5. After logout, retry protected call from devtools; confirm 401 response and no stale app data visible.
