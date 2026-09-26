import assert from "node:assert/strict";
import { test } from "node:test";
import { compileQuestions } from "../src/compile.ts";
import { LABEL_ID } from "../src/labels.ts";
import { clean, tokenize } from "../src/tokenize.ts";

test("tokenize cleans fences and urls", () => {
  const text = clean("see https://example.com and\n```\nx=1\n```\nok");
  assert.match(text, /\[URL\]/);
  assert.match(text, /\[CODE\]/);
});

test("compile either_or from tagged spans", () => {
  // Q span must include "?" (compiler keeps only ask-like spans).
  const text = "Want me to merge it now or wait for CI?";
  const tokens = tokenize(text);
  const labels = tokens.map((t) => {
    const w = text.slice(t.start, t.end);
    if (/^Want$/i.test(w)) return LABEL_ID.Q_B;
    if (/^(me|to|\?)$/i.test(w)) return LABEL_ID.Q_I;
    if (/^merge$/i.test(w)) return LABEL_ID.OPT_B;
    if (/^(it|now)$/i.test(w)) return LABEL_ID.OPT_I;
    if (/^wait$/i.test(w)) return LABEL_ID.OPT_B;
    if (/^(for|CI)$/i.test(w)) return LABEL_ID.OPT_I;
    return LABEL_ID.O;
  });
  // Keep Q open through the end so the "?" stays in the question span.
  let seenQ = false;
  for (let i = 0; i < tokens.length; i++) {
    const w = text.slice(tokens[i]!.start, tokens[i]!.end);
    if (/^Want$/i.test(w)) {
      labels[i] = LABEL_ID.Q_B;
      seenQ = true;
    } else if (seenQ && w === "?") {
      labels[i] = LABEL_ID.Q_I;
    } else if (/^merge$/i.test(w)) labels[i] = LABEL_ID.OPT_B;
    else if (/^(it|now)$/i.test(w)) labels[i] = LABEL_ID.OPT_I;
    else if (/^wait$/i.test(w)) labels[i] = LABEL_ID.OPT_B;
    else if (/^(for|CI)$/i.test(w)) labels[i] = LABEL_ID.OPT_I;
    else if (seenQ && w !== "?" && !/^(merge|it|now|wait|for|CI)$/i.test(w)) labels[i] = LABEL_ID.Q_I;
  }
  const qs = compileQuestions(text, tokens, labels);
  assert.ok(qs.length >= 1);
  assert.equal(qs[0]!.kind, "either_or");
  assert.ok(qs[0]!.propose);
  assert.ok(qs[0]!.options.length >= 2);
});
