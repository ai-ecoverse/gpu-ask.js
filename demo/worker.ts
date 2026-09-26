/** Inference worker. */

import { loadAsk, parse, type AskModel, type ParseResult } from "../src/index.ts";
import { ort } from "./ort-wasm.ts";

export type WorkerIn =
  | { type: "load"; baseUrl: string }
  | { type: "predict"; id: number; text: string };

export type WorkerOut =
  | { type: "ready"; members: number }
  | ({ type: "result"; id: number; ms: number } & ParseResult)
  | { type: "error"; id?: number; message: string };

let model: AskModel | null = null;

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      model = await loadAsk(msg.baseUrl, { ort: ort as never });
      const out: WorkerOut = { type: "ready", members: model.sessions.length };
      self.postMessage(out);
      return;
    }
    if (msg.type === "predict") {
      if (!model) throw new Error("model not loaded");
      const t0 = performance.now();
      const result = await parse(model, msg.text);
      const out: WorkerOut = {
        type: "result",
        id: msg.id,
        ms: Math.round(performance.now() - t0),
        ...result,
      };
      self.postMessage(out);
    }
  } catch (err) {
    const out: WorkerOut = {
      type: "error",
      id: msg.type === "predict" ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(out);
  }
};
