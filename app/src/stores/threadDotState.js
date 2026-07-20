// Pure dot-state derivation for chat/thread sidebar summaries. The generic
// SidebarItem renders "working" as amber, "unopened" as blue, and anything else
// as no dot.
export function threadDotState(summary) {
  if (summary?.status === "running") return "working";
  if (summary?.status === "complete" && !summary.opened) return "unopened";
  return "none";
}
