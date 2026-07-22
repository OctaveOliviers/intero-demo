export function createThreadMessageKeyer() {
  const localKeys = new WeakMap();
  let nextLocalKey = 0;

  return function messageKey(message) {
    const explicitId = String(message?.id || message?.message_id || "").trim();
    if (explicitId) return `id:${explicitId}`;

    if (message && typeof message === "object") {
      let key = localKeys.get(message);
      if (!key) {
        nextLocalKey += 1;
        key = `local:${nextLocalKey}`;
        localKeys.set(message, key);
      }
      return key;
    }

    return `value:${String(message)}`;
  };
}
