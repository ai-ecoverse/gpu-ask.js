/** Load the ONNX ensemble and parse agent messages. */

import { compileQuestions, type Question } from "./compile.ts";
import { viterbi } from "./crf.ts";
import { NUM_LABELS } from "./labels.ts";
import {
  FEATURE_ROWS,
  MAX_TOKENS,
  MAX_WIDTH,
  clean,
  featuresV1,
  packRows,
  tailStart,
  tokenize,
  type Token,
} from "./tokenize.ts";

/** Minimal onnxruntime-web surface we need (caller passes the real module). */
export type OrtModule = {
  InferenceSession: {
    create(
      path: string | Uint8Array | ArrayBuffer,
      options?: { executionProviders?: string[] },
    ): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
    }>;
  };
  Tensor: new (
    type: string,
    data: BigInt64Array | Float32Array,
    dims: number[],
  ) => unknown;
  env?: { wasm?: { wasmPaths?: unknown; numThreads?: number } };
};

export type AskModel = {
  sessions: Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>[];
  start: number[];
  transition: number[][];
  staticVocab: Map<string, number>;
  featureRows: number;
  ort: OrtModule;
  baseUrl: string;
};

export type ParseResult = {
  text: string;
  questions: Question[];
  labels: number[];
  tokens: Token[];
  truncated: boolean;
};

export type LoadAskOptions = {
  ort: OrtModule;
  executionProviders?: string[];
};

/** URL of the weights shipped inside this package (`models/v13/`). */
export function bundledModelUrl(): string {
  return new URL("../models/v13/", import.meta.url).href;
}

function joinUrl(base: string, name: string): string {
  return base.endsWith("/") ? base + name : `${base}/${name}`;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const dig = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Load the ONNX ensemble from `baseUrl` (directory of config.json, crf.json, member*.onnx). */
export async function loadAsk(baseUrl: string, options: LoadAskOptions): Promise<AskModel> {
  const ort = options.ort;
  const eps = options.executionProviders ?? ["wasm"];

  const [config, crf, vocabList, manifest] = await Promise.all([
    fetch(joinUrl(baseUrl, "config.json")).then((r) => {
      if (!r.ok) throw new Error(`config.json: ${r.status}`);
      return r.json();
    }),
    fetch(joinUrl(baseUrl, "crf.json")).then((r) => {
      if (!r.ok) throw new Error(`crf.json: ${r.status}`);
      return r.json();
    }),
    fetch(joinUrl(baseUrl, "static_vocab.json")).then((r) => {
      if (!r.ok) throw new Error(`static_vocab.json: ${r.status}`);
      return r.json() as Promise<string[]>;
    }),
    fetch(joinUrl(baseUrl, "manifest.json"))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const members: string[] = config.onnx ?? ["member0.onnx"];
  const sessions = [];
  for (const name of members) {
    const url = joinUrl(baseUrl, name);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const buf = await res.arrayBuffer();
    if (manifest?.files?.[name]?.sha256) {
      const got = await sha256Hex(buf);
      if (got !== manifest.files[name].sha256) {
        throw new Error(`${name}: sha256 mismatch (got ${got}, want ${manifest.files[name].sha256})`);
      }
    }
    sessions.push(await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: eps }));
  }

  return {
    sessions,
    start: crf.start,
    transition: crf.transition,
    staticVocab: new Map(vocabList.map((w, i) => [w, i])),
    featureRows: config.feature_rows ?? FEATURE_ROWS,
    ort,
    baseUrl,
  };
}

async function emissions(model: AskModel, rows: Int32Array): Promise<Float32Array> {
  const tensor = new model.ort.Tensor("int64", BigInt64Array.from(Array.from(rows, (x) => BigInt(x))), [
    1,
    MAX_TOKENS,
    MAX_WIDTH,
  ]);
  const outs: Float32Array[] = [];
  for (const sess of model.sessions) {
    const result = await sess.run({ rows: tensor });
    outs.push(result.emissions!.data as Float32Array);
  }
  if (outs.length === 1) return outs[0]!;
  const avg = new Float32Array(outs[0]!.length);
  for (const o of outs) {
    for (let i = 0; i < avg.length; i++) avg[i]! += o[i]!;
  }
  for (let i = 0; i < avg.length; i++) avg[i]! /= outs.length;
  return avg;
}

/** Tag an agent message and compile structured questions. */
export async function parse(model: AskModel, raw: string): Promise<ParseResult> {
  const text = clean(raw);
  const all = tokenize(text);
  const start = tailStart(all);
  const tokens = all.slice(start);
  const rows = featuresV1(text, tokens, model.staticVocab);
  const packed = packRows(rows, model.featureRows);
  const em = await emissions(model, packed);
  const stepEm = em.subarray(0, tokens.length * NUM_LABELS);
  const labels = viterbi(stepEm, tokens.length, model.start, model.transition);
  const questions = compileQuestions(text, tokens, labels);
  return { text, questions, labels, tokens, truncated: start > 0 };
}
