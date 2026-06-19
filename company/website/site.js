/* Shared client-side behavior for the Melodic Health marketing site.
 * Loaded by index.html and about.html. */

// ── Mobile nav toggle ───────────────────────────────────────
(() => {
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

// ── Demo form ───────────────────────────────────────────────
//
// Submits to a Google Apps Script Web App that emails octave@melodic.health.
// See contact-endpoint.gs in this folder for the deployment recipe.
//
// If ENDPOINT is empty, or the request fails, the form falls back to a
// pre-filled mailto: so the visitor's own mail client opens with the body.
(() => {
  const ENDPOINT =
    'https://script.google.com/macros/s/AKfycbzjG2Ifb89xOIk-tkiAiPG9ky2aMFs4H7YrXA43tvya01lkeoEYj-u89-HtQJ4GsfSNug/exec';
  const TO = 'octave@melodic.health';

  const form = document.getElementById('demo-form');
  if (!form) return;
  const ok = document.getElementById('form-ok');
  const submit = form.querySelector('.form__submit');

  function mailtoFallback(f) {
    const subject = `Demo request: ${f.org.value}`;
    const body = [
      `Email: ${f.email.value}`,
      `Organisation: ${f.org.value}`,
      '',
      f.message.value,
    ].join('\n');
    window.location.href =
      `mailto:${TO}?subject=` +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const f = form.elements;

    if (!ENDPOINT) {
      mailtoFallback(f);
      if (ok) ok.hidden = false;
      return;
    }

    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = 'Sending…';
    try {
      // text/plain avoids a CORS preflight against Apps Script.
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          email: f.email.value,
          organisation: f.org.value,
          message: f.message.value,
        }),
      });
      if (ok) ok.hidden = false;
      form.reset();
    } catch (err) {
      mailtoFallback(f);
    } finally {
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();
