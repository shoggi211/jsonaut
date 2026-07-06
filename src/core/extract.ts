import { repairPipeline } from "./pipeline.js";
import type { RepairResult } from "./types.js";

type Schema = Record<string, unknown>;

/**
 * Find top-level JSON-looking spans ({...} or [...]) embedded in arbitrary text,
 * respecting strings/escapes so braces inside strings don't break balancing.
 * Returns candidate substrings, largest first.
 */
export function findJsonCandidates(text: string): string[] {
  const spans: string[] = [];
  const opens: Record<string, string> = { "{": "}", "[": "]" };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const close = opens[ch];
      let depth = 0;
      let inStr = false;
      let esc = false;
      let j = i;
      for (; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === ch) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            spans.push(text.slice(i, j + 1));
            break;
          }
        }
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return spans.sort((a, b) => b.length - a.length);
}

/**
 * Deterministic extraction: locate JSON embedded in text and repair/validate it.
 *
 * We only run repair on *balanced JSON spans* found in the text — never jsonrepair
 * on the whole prose blob, because jsonrepair will happily invent structure from
 * plain prose ("a, b" -> ["a","b"]). The whole-string path runs only as a fallback
 * when the payload actually starts as JSON (so a bare value or fenced block still
 * works), guarding against that garbage-in-garbage-out case.
 */
export function extractDeterministic(text: string, schema?: Schema): RepairResult {
  let best: RepairResult | null = null;

  for (const span of findJsonCandidates(text)) {
    const r = repairPipeline(span, schema);
    if (r.valid) return { ...r, changes: ["located JSON span within surrounding text", ...r.changes] };
    if (!best && r.repaired !== null) best = r;
  }

  // Fallback: the whole payload is itself JSON (clean, fenced, or a bare value).
  const head = text.trim().replace(/^`+[a-zA-Z0-9]*\s*/, "");
  if (/^[{["]/.test(head) || /^(true|false|null|-?\d)/.test(head)) {
    const whole = repairPipeline(text, schema);
    if (whole.valid) return { ...whole, changes: ["extracted JSON from text", ...whole.changes] };
    if (!best && whole.repaired !== null) best = whole;
  }

  return (
    best ?? {
      valid: false,
      repaired: null,
      method: "failed",
      changes: [],
      errors: ["no JSON could be located in the input text"],
      llm_required: true,
    }
  );
}
