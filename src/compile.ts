/** Deterministic roles → structured questions. Port of gq/compile.py (compiler kind). */

import { LABELS } from "./labels.ts";
import { KIND_NL, KIND_PARA, type Token } from "./tokenize.ts";

export type Question = {
  prompt: string;
  kind: string;
  propose: boolean;
  options: string[];
  default: number | null;
  multiSelect: boolean;
  span: [number, number];
};

const WH_START_RE =
  /^\W*(?:(?:ok(?:ay)?|so|and|now|ready|great|alright|also|then)\W+)?(what|which|where|when|why|how|who|whose|whom)\b/i;
const PROPOSE_RE =
  /\b(want me to|should i|shall i|would you like me to|do you want me to|can i|may i|okay to|ok to|should we|shall we)\b/i;
const OFFER_RE =
  /\bwould you (?:also )?like (?:a|an|the|some|more|help|me|us|recommendations|examples?|guidance|assistance)\b|^\W*want (?:a|an|the|another|some|more|diffs?|help|it|them|this|that)\b|\bdo you want (?:help|more|another)\b|\bwould you like to proceed\b|\bneed (?:any )?help\b|\bready (?:to (?:proceed|go|start|move on|publish|implement)|for)\b|^\W*(?:sound (?:right|good)|ok(?:ay)?|good to go|do you (?:agree|approve))\b|\bis there anything (?:else )?(?:i can|you(?:'d| would) like me)\b/i;
const MULTI_RE = /\b(and\/or|which ones|any of|all of these|pick several|select all)\b/i;
const QMARK_RE = /[?？]/;
const ESCAPE_RE =
  /^(?:(?:something|anything)(?: else)?\b|(?:do )?you have (?:a|any)\b.*\b(?:preference|take|idea|thought|suggestion)s?\b|other\b|neither\b|none of (?:these|the above)\b|your call\b)/i;
const OPEN_ASK_RE =
  /^\W*(?:(?:could|can|would) you (?:please )?(?:clarify|share|tell me|let me know|specify|provide|describe|paste|point me)\b|(?:could|can) you (?:please )?confirm (?:how|what|which|where|who|when)\b)/i;
const WH_AFTER_LEAD_RE =
  /^[^?]{0,60}?(?:[,:!—–]|\b(?:if so|in the meantime|also|and|now))\s*(?:what|which|where|when|why|how|who)\b/i;
const REQUEST_RE =
  /\b(?:could|can|would) you (?:please )?(?:also )?(?:provide|share|list|give|send|drop|paste|tell me|let me know|point me|specify|describe|confirm (?:the|your|which|what|how|where))\b|^\W*do you (?:remember|recall)\b|^\W*do you know (?:what|which|where|how|who|when|the)\b/i;
const REC_TAIL_RE = /\s*(?:\((?:recommended|default|my pick)\)|—\s*recommended)\s*$/i;
const REC_HEAD_RE = /^\s*(?:my\s+)?(?:recommendation|suggestion|pick)\s*[:—-]\s*/i;
const ENUM_RE = /\(\d{1,2}\)\s*|\b[a-z]\)\s+/g;
const OR_AFTER_RE = /\s*,?\s+or\s+(?!something\b|anything\b|not\b|do you have\b|you have\b)/y;
const OR_BEFORE_RE = /(?:,\s*|\s+)or\s+$/;
const PAIR_END_RE = /[?？]|,\s|;|\s\(|\s—|$/;
const PAIR_LEAD_RE =
  /(?:\b(?:want me to|should i|shall i|would you like me to|do you want me to|do you want|would you prefer|do you prefer|prefer|like me to|either|between)\s+|[:—(]\s*)/gi;
const LIST_ITEM_RE = /^\s*(?:[-*•]|\d{1,2}[.)]|\(?[a-zA-Z]\))\s+[*_`]*$/;
const OFFER_LEAD_RE =
  /\b(?:would you like me to|do you want me to|want me to|should i|shall i|would you like to|do you want to|would you prefer|do you prefer|i can|next steps?|options?)\b[^\n]*:\s*$/i;

function isProposal(prompt: string): boolean {
  if (WH_START_RE.test(prompt)) return false;
  return PROPOSE_RE.test(prompt) || OFFER_RE.test(prompt);
}

function isOpen(prompt: string): boolean {
  return (
    WH_START_RE.test(prompt) ||
    OPEN_ASK_RE.test(prompt) ||
    WH_AFTER_LEAD_RE.test(prompt) ||
    REQUEST_RE.test(prompt)
  );
}

function cleanOption(s: string): string {
  s = s.replace(REC_TAIL_RE, "").replace(/\*\*/g, "").replace(/__/g, "");
  s = s.replace(REC_HEAD_RE, "");
  s = s.replace(/^\s*\(\d{1,2}\)\s*/, "");
  if ((s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) s = s.replace(/^\(|\)$/g, "");
  s = s.trim().replace(/^[*_"'“”:]+|[*_"'“”:]+$/g, "").trim();
  if ((s.match(/`/g) || []).length % 2) s = s.replace(/`/g, "");
  else if ((s.match(/`/g) || []).length === 2 && s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1);
  return s.trim().replace(/^[*_"'“”:]+|[*_"'“”:]+$/g, "").trim();
}

type Span = { start: number; end: number; rec?: boolean; after_q?: number };

function completePair(text: string, q: Span, opt: Span): Span[] {
  OR_AFTER_RE.lastIndex = opt.end;
  const after = OR_AFTER_RE.exec(text);
  if (after && after.index < q.end) {
    const end = PAIR_END_RE.exec(text.slice(after.index + after[0].length, q.end));
    const stop = end ? after.index + after[0].length + end.index : q.end;
    if (stop - (after.index + after[0].length) >= 2) {
      return [opt, { start: after.index + after[0].length, end: stop, rec: false }];
    }
  }
  const before = OR_BEFORE_RE.exec(text.slice(q.start, opt.start));
  if (before) {
    const head = text.slice(q.start, q.start + before.index!);
    const leads = [...head.matchAll(PAIR_LEAD_RE)];
    const start = q.start + (leads.length ? leads[leads.length - 1]!.index! + leads[leads.length - 1]![0].length : 0);
    const stop = q.start + before.index!;
    if (stop - start >= 2 && text.slice(start, stop).split(/\s+/).length <= 15) {
      return [{ start, end: stop, rec: false }, opt];
    }
  }
  return [opt];
}

function splitInline(text: string, opt: Span): Span[] {
  let body = text.slice(opt.start, opt.end);
  let base = opt.start;
  if (body.includes(": ")) {
    const cut = body.lastIndexOf(": ") + 2;
    if (body.slice(cut).split(",").length - 1 >= 1) {
      base += cut;
      body = body.slice(cut);
    }
  }
  const enums = [...body.matchAll(ENUM_RE)];
  let pieces: [number, number][];
  if (enums.length >= 2) {
    const bounds = enums.map((m) => m.index! + m[0].length);
    pieces = bounds.map((b, i) => [b, i + 1 < enums.length ? enums[i + 1]!.index! : body.length]);
  } else {
    if ((body.match(/,/g) || []).length < 2) return [opt];
    pieces = [];
    let pos = 0;
    const re = /,\s*(?:or\s+|and\s+)?|\s+or\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      pieces.push([pos, m.index]);
      pos = m.index + m[0].length;
    }
    pieces.push([pos, body.length]);
    if (pieces.some(([a, b]) => body.slice(a, b).split(/\s+/).length > 4)) return [opt];
  }
  const out: Span[] = [];
  for (const [a, b] of pieces) {
    const seg = body.slice(a, b);
    const segS = seg.replace(/[ ,;]+$/, "").trimEnd();
    const lead = seg.length - seg.replace(/^[ (]+/, "").length;
    let stop = a + segS.length;
    if (segS.endsWith(")") && !segS.slice(lead).includes("(")) stop -= 1;
    if (stop - (a + lead) >= 1) out.push({ start: base + a + lead, end: base + stop, rec: false });
  }
  if (out.length) out[out.length - 1]!.rec = opt.rec;
  return out.length >= 2 ? out : [opt];
}

function listItemLine(text: string, start: number): number | null {
  const line = text.lastIndexOf("\n", start - 1) + 1;
  return LIST_ITEM_RE.test(text.slice(line, start)) ? line : null;
}

function mergeOfferLists(text: string, questions: Question[]): Question[] {
  const out: Question[] = [];
  let i = 0;
  while (i < questions.length) {
    let j = i;
    while (
      j < questions.length &&
      !questions[j]!.options.length &&
      listItemLine(text, questions[j]!.span[0]) !== null
    ) {
      j++;
    }
    if (j - i >= 2) {
      const first = listItemLine(text, questions[i]!.span[0])!;
      const leadStart = text.lastIndexOf("\n", Math.max(0, first - 1)) + 1;
      const lead = text.slice(leadStart, first).trim();
      if (OFFER_LEAD_RE.test(lead)) {
        const items = questions.slice(i, j).map((q) => cleanOption(q.prompt.replace(/[?？ ]+$/, "")));
        out.push({
          prompt: `${lead} ${items.join(" / ")}?`,
          kind: items.length === 2 ? "either_or" : "multi_choice",
          propose: isProposal(lead),
          options: items,
          default: null,
          multiSelect: MULTI_RE.test(lead),
          span: [
            leadStart + (text.slice(leadStart, first).length - text.slice(leadStart, first).trimStart().length),
            questions[j - 1]!.span[1],
          ],
        });
        i = j;
        continue;
      }
    }
    out.push(questions[i]!);
    i++;
  }
  return out;
}

export function compileQuestions(text: string, tokens: Token[], labels: number[]): Question[] {
  const names = labels.map((i) => LABELS[i]!);
  const questions: Span[] = [];
  const options: Span[] = [];
  let curQ: Span | null = null;
  let curOpt: Span | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const name = names[i]!;
    if (name === "Q_B" || (name === "Q_I" && !curQ)) {
      curQ = { start: tok.start, end: tok.end };
      questions.push(curQ);
      curOpt = null;
    } else if (name === "Q_I" && curQ) {
      curQ.end = tok.end;
    } else if (name === "OPT_B" || (name === "OPT_I" && !curOpt)) {
      curOpt = { start: tok.start, end: tok.end, rec: false, after_q: questions.length - 1 };
      options.push(curOpt);
    } else if (name === "OPT_I" && curOpt) {
      curOpt.end = tok.end;
    } else if (name === "REC" && curOpt) {
      curOpt.rec = true;
    }
    if (name === "O" && (tok.kind === KIND_NL || tok.kind === KIND_PARA)) {
      curOpt = null;
      if (tok.kind === KIND_PARA) curQ = null;
    }
  }
  if (!questions.length) return [];

  const asks = (qi: number) => {
    const span = text.slice(questions[qi]!.start, questions[qi]!.end);
    if (QMARK_RE.test(span)) return true;
    return span.trimEnd().endsWith(":") && options.filter((o) => o.after_q === qi).length >= 2;
  };
  const kept = questions.map((_, i) => i).filter(asks);
  if (!kept.length) return [];
  for (const opt of options) {
    if (opt.after_q! >= 0 && !kept.includes(opt.after_q!)) {
      opt.after_q = Math.max(-1, ...kept.filter((k) => k < opt.after_q!));
    }
    opt.after_q = kept.includes(opt.after_q!) ? kept.indexOf(opt.after_q!) : -1;
  }
  const qs = kept.map((i) => questions[i]!);
  const owned: Span[][] = qs.map(() => []);
  for (const opt of options) owned[Math.max(opt.after_q!, 0)]!.push(opt);

  const out: Question[] = [];
  for (let qi = 0; qi < qs.length; qi++) {
    const q = qs[qi]!;
    let opts = owned[qi]!;
    const prompt = text.slice(q.start, q.end).trim();
    if (opts.length <= 2) opts = opts.flatMap((o) => splitInline(text, o));
    const escaped = opts.filter((o) => ESCAPE_RE.test(cleanOption(text.slice(o.start, o.end))));
    opts = opts.filter((o) => !escaped.includes(o));
    if (opts.length === 1 && !escaped.length) opts = completePair(text, q, opts[0]!);
    if (opts.length === 1) opts = [];
    const labelsText = opts.map((o) => cleanOption(text.slice(o.start, o.end)));
    const kind =
      opts.length === 2 ? "either_or" : opts.length > 2 ? "multi_choice" : isOpen(prompt) ? "open" : "yes_no";
    const def = opts.findIndex((o) => o.rec);
    out.push({
      prompt,
      kind,
      propose: isProposal(prompt),
      options: labelsText,
      default: def >= 0 ? def : null,
      multiSelect: MULTI_RE.test(prompt),
      span: [q.start, q.end],
    });
  }
  return mergeOfferLists(text, out);
}
