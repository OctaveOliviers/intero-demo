function grantId(grant) {
  return grant?.grant_id || grant?.id || "";
}

export function parseProcessedGrantIds(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === "string" && id));
  } catch {
    return new Set();
  }
}

export function serializeProcessedGrantIds(ids) {
  return JSON.stringify([...ids].sort());
}

export function pendingSharedResourceGrants(grants, processedGrantIds = new Set(), resourceType) {
  return (Array.isArray(grants) ? grants : []).filter((grant) => {
    const id = grantId(grant);
    return grant?.resource_type === resourceType && id && !processedGrantIds.has(id);
  });
}

export function pendingSharedDatasetGrants(grants, processedGrantIds = new Set()) {
  return pendingSharedResourceGrants(grants, processedGrantIds, "dataset");
}

export function pendingGrantByResourceId(
  grants,
  processedGrantIds = new Set(),
  resourceType = "dataset",
) {
  const pending = {};
  for (const grant of pendingSharedResourceGrants(grants, processedGrantIds, resourceType)) {
    if (grant?.resource_id) pending[grant.resource_id] = grant;
  }
  return pending;
}
