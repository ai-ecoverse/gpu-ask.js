/** Turn token roles into overlapping character highlights. */

import { LABELS } from "./labels.ts";
import type { Token } from "./tokenize.ts";

export type Role = "O" | "Q" | "OPT" | "REC";

export function roleOf(label: number): Role {
  const name = LABELS[label] ?? "O";
  if (name.startsWith("Q")) return "Q";
  if (name.startsWith("OPT")) return "OPT";
  if (name === "REC") return "REC";
  return "O";
}

/** Per-character role for `text`, using absolute token offsets. */
export function charRoles(text: string, tokens: Token[], labels: number[]): Role[] {
  const roles: Role[] = Array.from({ length: text.length }, () => "O");
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const role = roleOf(labels[i] ?? 0);
    if (role === "O") continue;
    for (let c = tok.start; c < Math.min(tok.end, text.length); c++) {
      // REC wins over OPT/Q for the marker token; OPT wins over Q when spans nest oddly.
      const cur = roles[c]!;
      if (role === "REC" || cur === "O" || (role === "OPT" && cur === "Q")) roles[c] = role;
    }
  }
  return roles;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML with <mark data-role=…> spans. Newlines become <br>. */
export function highlightHtml(text: string, tokens: Token[], labels: number[]): string {
  const roles = charRoles(text, tokens, labels);
  let html = "";
  let i = 0;
  while (i < text.length) {
    const role = roles[i]!;
    let j = i + 1;
    while (j < text.length && roles[j] === role) j++;
    const chunk = text.slice(i, j);
    const parts = chunk.split("\n");
    const body = parts
      .map((p) => (role === "O" ? escapeHtml(p) : `<mark data-role="${role}">${escapeHtml(p)}</mark>`))
      .join("<br>");
    html += body;
    i = j;
  }
  return html || "&nbsp;";
}
