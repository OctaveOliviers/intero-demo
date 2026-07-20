import snarkdown from "snarkdown";

export function answerSegments(content, citations = []) {
  const text = String(content || "");
  const byMarker = new Map(
    (Array.isArray(citations) ? citations : [])
      .filter((citation) => citation && citation.marker != null)
      .map((citation) => [String(citation.marker), citation]),
  );
  if (!byMarker.size) return [{ type: "text", text }];

  const segments = [];
  const pattern = /\[([^\]\n]+)\]\{(\d+)\}|\[(\d+)\]/g;
  const displayByMarker = new Map();
  let nextDisplay = 1;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const linkedText = match[1] || null;
    const marker = match[2] || match[3];
    const citation = byMarker.get(marker);
    if (!citation) continue;
    const before = linkedText
      ? text.slice(last, match.index)
      : text.slice(last, match.index).replace(/[ \t]+$/, "");
    if (before) {
      segments.push({ type: "text", text: before });
    }
    if (linkedText) {
      segments.push({
        type: "citation",
        marker,
        citation,
        text: linkedText,
        linkedText: true,
      });
      last = match.index + match[0].length;
      pattern.lastIndex = last;
      continue;
    }
    const citationRun = [{ marker, citation }];
    let end = match.index + match[0].length;
    for (;;) {
      const next = /^[ \t]*(?:,[ \t]*)?\[(\d+)\]/.exec(text.slice(end));
      if (!next) break;
      const nextMarker = next[1];
      const nextCitation = byMarker.get(nextMarker);
      if (!nextCitation) break;
      citationRun.push({ marker: nextMarker, citation: nextCitation });
      end += next[0].length;
    }
    const punctuation = /^[ \t]*([.!?,;:])/.exec(text.slice(end));
    if (punctuation) {
      segments.push({ type: "text", text: punctuation[1] });
      end += punctuation[0].length;
    }
    for (const item of citationRun) {
      if (!displayByMarker.has(item.marker)) {
        displayByMarker.set(item.marker, nextDisplay);
        nextDisplay += 1;
      }
      const displayNumber = displayByMarker.get(item.marker);
      segments.push({
        type: "citation",
        marker: item.marker,
        displayNumber,
        citation: item.citation,
        text: String(displayNumber),
      });
    }
    last = end;
    pattern.lastIndex = end;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments.length ? segments : [{ type: "text", text }];
}

export function markdownHtml(content) {
  const source = String(content || "");
  if (!source) return "";
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let markdown = [];

  function flushMarkdown() {
    if (!markdown.length) return;
    html.push(snarkdown(markdown.join("\n")));
    markdown = [];
  }

  for (let i = 0; i < lines.length; i++) {
    if (!isTableStart(lines, i)) {
      markdown.push(lines[i]);
      continue;
    }
    flushMarkdown();
    const header = splitTableRow(lines[i]);
    const align = splitTableRow(lines[i + 1]).map(tableAlignClass);
    const body = [];
    i += 2;
    while (i < lines.length && isTableRow(lines[i])) {
      body.push(splitTableRow(lines[i]));
      i += 1;
    }
    i -= 1;
    html.push(renderTable(header, align, body));
  }
  flushMarkdown();
  return html.join("\n");
}

function isTableStart(lines, index) {
  return isTableRow(lines[index]) && isSeparatorRow(lines[index + 1]);
}

function isTableRow(line) {
  return typeof line === "string" && line.includes("|") && splitTableRow(line).length > 1;
}

function isSeparatorRow(line) {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function splitTableRow(line) {
  let value = String(line || "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function tableAlignClass(separator) {
  const cell = String(separator || "").replace(/\s+/g, "");
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  if (cell.endsWith(":")) return "right";
  return "left";
}

function renderTable(headers, align, rows) {
  const head = headers
    .map((cell, i) => `<th${alignAttr(align[i])}>${snarkdown(cell)}</th>`)
    .join("");
  const body = rows
    .map((row) =>
      `<tr>${row
        .map((cell, i) => `<td${alignAttr(align[i])}>${snarkdown(cell)}</td>`)
        .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function alignAttr(align) {
  return align && align !== "left" ? ` class="align-${align}"` : "";
}

export function scopeDisclosureVariant(scope) {
  return scope?.kind === "dataset" && scope?.dataset_id ? "chip" : null;
}
