<!--
  The login gate (C2 — doc 7 §Access). No data is reachable without login, so
  the app shows this screen until a session exists. On success it dispatches
  `authenticated` with the user; the shell can then render the app and, on
  logout, return here.

  Auth is cookie-based (HttpOnly session set by the server), so `credentials:
  "include"` is all the client needs — there is no token to store. This talks to
  the real auth API directly rather than through the per-domain mock seam, since
  auth has no mock and is the precondition for everything behind it.
-->
<script>
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  let username = "";
  let password = "";
  let submitting = false;
  let error = "";

  async function handleSubmit() {
    if (submitting) return;
    if (!username.trim() || !password) {
      error = "Enter your username and password.";
      return;
    }
    submitting = true;
    error = "";
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Login failed");
      }
      const user = await res.json();
      password = "";
      dispatch("authenticated", user);
    } catch (e) {
      error = e.message || "Could not log in. Please try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="login-screen">
  <form class="login-card" on:submit|preventDefault={handleSubmit}>
    <h1 class="brand">Intero</h1>
    <p class="intro">Sign in to access your audits.</p>

    <label class="field">
      <span class="field-label">Username</span>
      <input
        class="input"
        type="text"
        autocomplete="username"
        bind:value={username}
        disabled={submitting}
      />
    </label>

    <label class="field">
      <span class="field-label">Password</span>
      <input
        class="input"
        type="password"
        autocomplete="current-password"
        bind:value={password}
        disabled={submitting}
      />
    </label>

    {#if error}<div class="error">{error}</div>{/if}

    <button type="submit" class="btn primary" disabled={submitting}>
      {submitting ? "Signing in…" : "Sign in"}
    </button>
  </form>
</div>

<style>
  .login-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    z-index: 2000;
  }
  .login-card {
    background: var(--color-surface);
    width: min(380px, 92vw);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .brand {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }
  .intro {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }
  .input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color var(--dur-fast) var(--ease);
  }
  .input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .error {
    font-size: var(--text-sm);
    color: var(--color-danger, #c0392b);
  }
  .btn {
    padding: var(--space-2) var(--space-4);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease);
  }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn.primary {
    background: var(--color-accent);
    color: var(--color-on-accent, #fff);
  }
  .btn.primary:hover:not(:disabled) { filter: brightness(0.95); }
</style>
