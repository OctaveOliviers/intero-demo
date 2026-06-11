// Vercel serverless function: receives feedback from the app and opens a
// GitHub issue. Runs server-side so the GitHub token never reaches the browser.
//
// Required environment variables (set in Vercel → Settings → Environment Variables):
//   GITHUB_TOKEN  — a fine-grained PAT with "Issues: write" on the target repo
//   GITHUB_REPO   — "owner/repo", e.g. "OctaveOliviers/audit-agents"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return res.status(500).json({ detail: "Feedback is not configured on the server." });
  }

  const { title, body, url } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ detail: "Feedback details are required." });
  }

  const issueTitle = (title && String(title).trim()) || String(body).trim().slice(0, 60);
  const issueBody = [
    String(body).trim(),
    "",
    "---",
    url ? `Submitted from: ${url}` : null,
    "_Filed via the in-app feedback form._",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["feedback"],
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text().catch(() => "");
      console.error("GitHub issue creation failed:", ghRes.status, detail);
      return res.status(502).json({ detail: "Could not create the issue." });
    }

    const issue = await ghRes.json();
    return res.status(200).json({ ok: true, number: issue.number, url: issue.html_url });
  } catch (err) {
    console.error("Feedback handler error:", err);
    return res.status(500).json({ detail: "Unexpected error sending feedback." });
  }
}
