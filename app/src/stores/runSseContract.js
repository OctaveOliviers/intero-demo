export function parseRunSseDataFrame(frame) {
  if (typeof frame !== "string" || !frame.startsWith("data: ")) return null;
  const payload = frame.slice("data: ".length).trim();
  if (!payload) return null;
  return JSON.parse(payload);
}

export function parseRunSsePayload(payload) {
  if (typeof payload !== "string") return null;
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function runEventDiscriminator(event) {
  return typeof event?.type === "string" ? event.type : null;
}
