/** Tokenizer + v1 sparse features. Must match gq/tokenize.py (feature_version=1). */

export const MAX_TOKENS = 256;
export const MAX_WIDTH = 16;
export const STATIC_OFFSET = 1 << 24;

export const KIND_WORD = 0;
export const KIND_NUM = 1;
export const KIND_PUNCT = 2;
export const KIND_NL = 3;
export const KIND_PARA = 4;
export const KIND_PLACEHOLDER = 5;

const HASH_ROWS = 2048;
const SUFFIX_ROWS = 256;
const OFF_KIND = 0;
const OFF_LEN = OFF_KIND + 8;
const OFF_CASE = OFF_LEN + 8;
const OFF_HASH = OFF_CASE + 8;
const OFF_SUFFIX = OFF_HASH + HASH_ROWS;
const OFF_LINE_POS = OFF_SUFFIX + SUFFIX_ROWS;
const OFF_PARA_POS = OFF_LINE_POS + 8;
const OFF_FLAGS = OFF_PARA_POS + 8;
const FLAG_NAMES = [
  "line_start",
  "list_line",
  "list_marker",
  "question_sentence",
  "question_line",
  "after_colon",
  "sentence_start",
  "wh_word",
] as const;

export const FEATURE_ROWS = OFF_FLAGS + FLAG_NAMES.length;

const FENCE_RE = /```[\s\S]*?(?:```|$)/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const TOKEN_RE =
  /\n[ \t]*\n\s*|\n|\[CODE\]|\[URL\]|[^\W\d_]+(?:['’][^\W\d_]+)*|\d+|[^\s]/gu;
const LIST_MARKER_RE =
  /^[ \t]*(?:[-*•]|\d{1,2}[.)]|[A-Za-z][.)]|\([A-Za-z0-9]\)|\*\*[A-Za-z0-9][.)]?\*\*)[ \t]+/;
const WH_WORDS = new Set([
  "what",
  "which",
  "where",
  "when",
  "why",
  "how",
  "who",
  "whose",
  "whom",
]);

export type Token = { start: number; end: number; text: string; kind: number };

/** CRC-32 matching Python zlib.crc32 (unsigned). */
export function crc32(str: string): number {
  const bytes = new TextEncoder().encode(str);
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function hash(value: string, buckets: number): number {
  return crc32(value) % buckets;
}

function lengthBucket(n: number): number {
  for (let i = 0; i < 6; i++) {
    if (n <= [1, 2, 3, 5, 8, 12][i]!) return i;
  }
  return 6;
}

function caseBucket(tok: string): number {
  const ch = tok[0];
  if (!ch || !/\p{L}/u.test(ch)) return 0;
  if (tok === tok.toLowerCase()) return 1;
  if (tok === tok.toUpperCase() && tok.length > 1) return 3;
  if (ch === ch.toUpperCase() && (tok.length === 1 || tok.slice(1) === tok.slice(1).toLowerCase()))
    return 2;
  return 4;
}

function kindOf(tok: string): number {
  if (tok.startsWith("\n")) return tok.split("\n").length - 1 >= 2 ? KIND_PARA : KIND_NL;
  if (tok === "[CODE]" || tok === "[URL]") return KIND_PLACEHOLDER;
  if (/\d/.test(tok[0]!)) return KIND_NUM;
  if (/\p{L}/u.test(tok[0]!)) return KIND_WORD;
  return KIND_PUNCT;
}

export function clean(text: string): string {
  return text.replace(FENCE_RE, "[CODE]").replace(URL_RE, "[URL]").replace(/\r\n/g, "\n").trim();
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: kindOf(m[0]) });
  }
  return out;
}

export function tailStart(tokens: Token[], limit = MAX_TOKENS): number {
  return Math.max(0, tokens.length - limit);
}

export function featuresV1(
  text: string,
  tokens: Token[],
  staticVocab?: Map<string, number> | null,
): number[][] {
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let pos = 0;
  for (const line of lines) {
    lineStarts.push(pos);
    pos += line.length + 1;
  }
  const nLines = lines.length;
  const paraBreaks: number[] = [];
  {
    const re = /\n[ \t]*\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) paraBreaks.push(m.index);
  }

  const lineIndex = (offset: number): number => {
    let lo = 0,
      hi = nLines - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const inQuestion = new Array<boolean>(tokens.length).fill(false);
  const sentenceStart = new Array<boolean>(tokens.length).fill(false);
  let begin = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const ends =
      tok.kind === KIND_NL || tok.kind === KIND_PARA || tok.text === "." || tok.text === "!" || tok.text === "?";
    if (ends || i === tokens.length - 1) {
      if (tok.text === "?") {
        for (let j = begin; j <= i; j++) inQuestion[j] = true;
      }
      begin = i + 1;
    }
  }
  let firstInSentence = true;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.kind === KIND_NL || tok.kind === KIND_PARA) {
      firstInSentence = true;
      continue;
    }
    sentenceStart[i] =
      firstInSentence &&
      (tok.kind === KIND_WORD || tok.kind === KIND_NUM || tok.kind === KIND_PLACEHOLDER);
    if (sentenceStart[i]) firstInSentence = false;
    if (tok.text === "." || tok.text === "!" || tok.text === "?") firstInSentence = true;
  }

  const rows: number[][] = [];
  let prevLine = -1;
  let afterColon = false;
  const unknown = staticVocab ? staticVocab.size : -1;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const li = lineIndex(tok.start);
    const line = lines[li]!;
    const marker = LIST_MARKER_RE.exec(line);
    const lower = tok.text.toLowerCase();
    const flags: Record<(typeof FLAG_NAMES)[number], boolean> = {
      line_start: li !== prevLine && tok.kind !== KIND_NL && tok.kind !== KIND_PARA,
      list_line: !!marker,
      list_marker: !!(marker && tok.start - lineStarts[li]! < marker[0].length),
      question_sentence: inQuestion[i]!,
      question_line: line.includes("?"),
      after_colon: afterColon,
      sentence_start: sentenceStart[i]!,
      wh_word: WH_WORDS.has(lower),
    };
    if (tok.kind !== KIND_NL && tok.kind !== KIND_PARA) prevLine = li;
    if (tok.text === ":") afterColon = true;
    else if (
      tok.kind === KIND_NL ||
      tok.kind === KIND_PARA ||
      tok.text === "." ||
      tok.text === "?" ||
      tok.text === "!"
    ) {
      afterColon = false;
    }
    const linesFromEnd = nLines - 1 - li;
    const parasFromEnd = paraBreaks.filter((b) => b >= tok.end).length;
    const r = [
      OFF_KIND + tok.kind,
      OFF_LEN + lengthBucket(tok.text.length),
      OFF_CASE + caseBucket(tok.text),
      OFF_HASH + hash(lower, HASH_ROWS),
      OFF_SUFFIX + hash("~" + lower.slice(-3), SUFFIX_ROWS),
      OFF_LINE_POS + Math.min(linesFromEnd, 7),
      OFF_PARA_POS + Math.min(parasFromEnd, 7),
    ];
    FLAG_NAMES.forEach((name, k) => {
      if (flags[name]) r.push(OFF_FLAGS + k);
    });
    if (staticVocab) {
      const idx = staticVocab.get(lower) ?? unknown;
      r.push(STATIC_OFFSET + idx);
    }
    rows.push(r);
  }
  return rows;
}

/** Pack feature rows into Int32Array shaped [1, MAX_TOKENS, MAX_WIDTH]. */
export function packRows(rowLists: number[][], featurePad = FEATURE_ROWS): Int32Array {
  const out = new Int32Array(MAX_TOKENS * MAX_WIDTH);
  out.fill(featurePad);
  for (let t = 0; t < Math.min(rowLists.length, MAX_TOKENS); t++) {
    const r = rowLists[t]!;
    for (let w = 0; w < Math.min(r.length, MAX_WIDTH); w++) {
      out[t * MAX_WIDTH + w] = r[w]!;
    }
  }
  return out;
}
