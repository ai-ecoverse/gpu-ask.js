import "./demo.css";
import type { Question } from "../src/compile.ts";
import { EXAMPLES } from "../src/examples.ts";
import { highlightHtml } from "../src/highlight.ts";
import type { WorkerIn, WorkerOut } from "./worker.ts";

const STORE = "gpu-ask:";
const store = {
  get: (k: string) => localStorage.getItem(STORE + k),
  set: (k: string, v: string) => localStorage.setItem(STORE + k, v),
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const presetEl = $<HTMLSelectElement>("preset");
const messageEl = $("message");
const editorEl = $<HTMLTextAreaElement>("editor");
const statusEl = $("status");
const cardsEl = $("cards");
const jsonEl = $("json");
const parseBtn = $<HTMLButtonElement>("parse");
const editBtn = $<HTMLButtonElement>("edit");

let editing = false;
let ready = false;
let currentText = EXAMPLES[0]!.text;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Extract<WorkerOut, { type: "result" }>) => void; reject: (e: Error) => void }>();

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

worker.onmessage = (e: MessageEvent<WorkerOut>) => {
  const m = e.data;
  if (m.type === "ready") {
    ready = true;
    parseBtn.disabled = false;
    statusEl.textContent = `Ready · ${m.members} member${m.members > 1 ? "s" : ""} · WASM`;
    document.body.classList.remove("busy");
    void run();
    return;
  }
  if (m.type === "error") {
    document.body.classList.remove("busy");
    if (m.id != null && pending.has(m.id)) {
      pending.get(m.id)!.reject(new Error(m.message));
      pending.delete(m.id);
    } else {
      statusEl.textContent = m.message;
      statusEl.classList.add("err");
    }
    return;
  }
  if (m.type === "result") {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      p.resolve(m);
    }
  }
};

function send(msg: WorkerIn) {
  worker.postMessage(msg);
}

function predict(text: string) {
  const id = nextId++;
  return new Promise<Extract<WorkerOut, { type: "result" }>>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "predict", id, text });
  });
}

function fillPresets() {
  presetEl.replaceChildren();
  for (const ex of EXAMPLES) {
    presetEl.add(new Option(`${ex.title} — ${ex.blurb}`, ex.id));
  }
  presetEl.add(new Option("Your turn (paste)", "custom"));
  const saved = store.get("preset");
  if (saved && Array.from(presetEl.options).some((o) => o.value === saved)) presetEl.value = saved;
  else presetEl.value = EXAMPLES[0]!.id;
}

function applyPreset() {
  const id = presetEl.value;
  store.set("preset", id);
  if (id === "custom") {
    setEditing(true);
    if (!editorEl.value.trim()) editorEl.value = currentText;
    statusEl.textContent = "Paste a message, then Parse.";
    cardsEl.innerHTML = `<p class="empty">Compiled choices appear here.</p>`;
    jsonEl.textContent = "";
    return;
  }
  const ex = EXAMPLES.find((e) => e.id === id)!;
  currentText = ex.text;
  setEditing(false);
  void run();
}

function setEditing(on: boolean) {
  editing = on;
  messageEl.hidden = on;
  editorEl.hidden = !on;
  editBtn.textContent = on ? "Show highlights" : "Edit";
  if (on) {
    editorEl.value = currentText;
    editorEl.focus();
  }
}

function renderCards(questions: Question[]) {
  cardsEl.replaceChildren();
  if (!questions.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No question found in this turn.";
    cardsEl.append(p);
    return;
  }
  for (const q of questions) {
    const card = document.createElement("article");
    card.className = "card";

    const meta = document.createElement("div");
    meta.className = "meta";
    const kind = document.createElement("span");
    kind.className = "chip kind";
    kind.textContent = q.kind;
    meta.append(kind);
    if (q.propose) {
      const prop = document.createElement("span");
      prop.className = "chip propose";
      prop.textContent = "propose";
      meta.append(prop);
    }
    if (q.multiSelect) {
      const ms = document.createElement("span");
      ms.className = "chip";
      ms.textContent = "multi-select";
      meta.append(ms);
    }
    card.append(meta);

    const prompt = document.createElement("p");
    prompt.className = "prompt";
    prompt.textContent = q.prompt;
    card.append(prompt);

    if (q.options.length) {
      const list = document.createElement("div");
      list.className = "options";
      q.options.forEach((opt, i) => {
        const row = document.createElement("div");
        row.className = "option";
        row.dataset.default = String(q.default === i);
        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = String.fromCharCode(65 + i);
        const label = document.createElement("span");
        label.textContent = opt + (q.default === i ? "  · recommended" : "");
        row.append(idx, label);
        list.append(row);
      });
      card.append(list);
    } else if (q.kind === "yes_no") {
      const list = document.createElement("div");
      list.className = "options";
      for (const [i, label] of ["Yes", "No"].entries()) {
        const row = document.createElement("div");
        row.className = "option";
        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = String.fromCharCode(65 + i);
        const text = document.createElement("span");
        text.textContent = label;
        row.append(idx, text);
        list.append(row);
      }
      card.append(list);
    } else {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Open answer — no fixed options.";
      card.append(p);
    }

    cardsEl.append(card);
  }
}

async function run() {
  if (!ready) return;
  if (editing) {
    currentText = editorEl.value;
    store.set("custom", currentText);
  }
  parseBtn.disabled = true;
  document.body.classList.add("busy");
  statusEl.textContent = "Running…";
  statusEl.classList.remove("err");
  try {
    const result = await predict(currentText);
    currentText = result.text;
    messageEl.innerHTML = highlightHtml(result.text, result.tokens, result.labels);
    setEditing(false);
    statusEl.textContent = result.truncated
      ? `${result.ms} ms · last ${result.tokens.length} tokens (truncated)`
      : `${result.ms} ms · ${result.tokens.length} tokens`;
    renderCards(result.questions);
    jsonEl.textContent = JSON.stringify(
      result.questions.map((q) => ({
        kind: q.kind,
        propose: q.propose,
        prompt: q.prompt,
        options: q.options,
        default: q.default,
        multiSelect: q.multiSelect,
        span: q.span,
      })),
      null,
      2,
    );
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e);
    statusEl.classList.add("err");
  } finally {
    parseBtn.disabled = !ready;
    document.body.classList.remove("busy");
  }
}

fillPresets();
const savedCustom = store.get("custom");
if (presetEl.value === "custom" && savedCustom) {
  currentText = savedCustom;
  editorEl.value = savedCustom;
} else if (presetEl.value !== "custom") {
  currentText = EXAMPLES.find((e) => e.id === presetEl.value)?.text ?? EXAMPLES[0]!.text;
}
messageEl.textContent = currentText;

presetEl.onchange = () => applyPreset();
parseBtn.onclick = () => void run();
editBtn.onclick = () => {
  if (editing) void run();
  else setEditing(true);
};
editorEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run();
});

document.body.classList.add("busy");
statusEl.textContent = "Loading ONNX model…";
send({ type: "load", baseUrl: `${location.origin}/model` });
