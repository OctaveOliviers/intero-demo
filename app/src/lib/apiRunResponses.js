function refreshErrorFromResponseBody(body, statusText) {
  const detail = body?.detail;
  const message =
    typeof detail === "string"
      ? detail
      : detail?.message || detail?.detail || statusText || "Refresh failed";
  const out = new Error(message || "Refresh failed");
  out.code = detail && typeof detail === "object" ? detail.code || null : null;
  return out;
}

export async function parseRefreshTablePopulationResponse(res, throwIfUnauthorized) {
  if (!res.ok) {
    await throwIfUnauthorized(res);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const out = refreshErrorFromResponseBody(err, res.statusText);
    out.status = res.status;
    throw out;
  }
  return res.json();
}

export async function parseWorkbookDownloadResponse(res, throwIfUnauthorized) {
  if (!res.ok) {
    await throwIfUnauthorized(res);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err?.detail === "string" ? err.detail : res.statusText;
    throw new Error(detail || "Failed to download workbook");
  }
  return res.blob();
}
