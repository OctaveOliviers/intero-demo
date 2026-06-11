import { writable } from "svelte/store";
import { authMe, AuthError } from "../lib/api.js";

// Single source of truth for frontend auth session state.
export const authStatus = writable("booting"); // booting | authenticated | unauthenticated
export const authUser = writable(null);

let bootstrapInFlight = null;

export function setAuthenticated(user) {
  authUser.set(user || null);
  authStatus.set(user ? "authenticated" : "unauthenticated");
}

export function clearAuth() {
  authUser.set(null);
  authStatus.set("unauthenticated");
}

// Idempotent-safe: concurrent callers share one in-flight request.
export async function bootstrapSession() {
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    authStatus.set("booting");
    try {
      const user = await authMe();
      setAuthenticated(user);
      return user;
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) {
        clearAuth();
        return null;
      }
      // Safe fallback for non-401 failures: never mark authenticated.
      console.error("bootstrapSession failed:", err);
      clearAuth();
      return null;
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}
