export const ATTACHMENT_TYPES = {
  dataset: { label: "Dataset", icon: "datasets" },
  template: { label: "Template", icon: "table" },
};

export function attachmentTypeLabel(type) {
  return ATTACHMENT_TYPES[type]?.label || "Attachment";
}

export function attachmentTypeIcon(type) {
  return ATTACHMENT_TYPES[type]?.icon || "table";
}
