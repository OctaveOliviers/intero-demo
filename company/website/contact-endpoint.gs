/**
 * Melodic Health — demo-request endpoint.
 *
 * Receives a POST from company/website/index.html's Book-a-Demo form and emails
 * the contents to octave@melodic.health using the deploying user's Gmail
 * (so no SMTP creds, no API keys, no external vendor).
 *
 * ─── Deploy (once) ─────────────────────────────────────────────────────────
 * 1. https://script.google.com → New project → paste this file as Code.gs.
 * 2. Optional: rename the project to "Melodic demo form".
 * 3. Deploy → New deployment → Type: Web app.
 *      - Description: "Melodic demo form v1"
 *      - Execute as: Me (octave@melodic.health)
 *      - Who has access: Anyone
 *    → Deploy. Authorise the Gmail send scope on first run.
 * 4. Copy the deployment URL (ends in /exec) and paste it into ENDPOINT in
 *    index.html.
 * 5. After any future edit: Deploy → Manage deployments → edit existing
 *    deployment → New version → Deploy (keeps the URL stable).
 * ───────────────────────────────────────────────────────────────────────────
 */

const TO = 'octave@melodic.health';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const email = (data.email || '').toString().trim();
    const organisation = (data.organisation || '').toString().trim();
    const message = (data.message || '').toString().trim();

    if (!email || !organisation) {
      return json_({ ok: false, error: 'email and organisation are required' });
    }

    const subject = `Demo request — ${organisation}`;
    const body =
      `New demo request via melodic.health\n\n` +
      `Email:        ${email}\n` +
      `Organisation: ${organisation}\n\n` +
      `Message:\n${message || '(none)'}\n`;

    MailApp.sendEmail({
      to: TO,
      replyTo: email,
      subject: subject,
      body: body,
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Lets you sanity-check the URL in a browser before wiring the form.
function doGet() {
  return ContentService.createTextOutput('Melodic demo endpoint OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
