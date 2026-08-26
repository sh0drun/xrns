import { renderDiff } from "./render-diff.js";
import { renderSong } from "./render-song.js";
import type { ParseRequest, Slot, WorkerMessage } from "./parse-worker.js";

const app = required("#app");

const worker = new Worker(new URL("./parse-worker.ts", import.meta.url), { type: "module" });

const names = new Map<Slot, string>();

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const result = event.data;

  if (result.kind === "failed") {
    show(message(`${result.name} ${result.message}`));
    return;
  }

  if (result.kind === "song") {
    if (names.size === 1) show(renderSong(result.name, result.song));
    return;
  }

  show(renderDiff(names.get("before") ?? "", names.get("after") ?? "", result.diff));
};

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("dragging");
});

document.addEventListener("dragleave", () => {
  document.body.classList.remove("dragging");
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");

  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length === 0) return;

  show(message(`reading ${files.map((file) => file.name).join(", ")}`));
  void load(files);
});

/**
 * The first file dropped is the older one and the second is the newer, rather than the
 * page guessing from a file name or a timestamp
 */
async function load(files: readonly File[]): Promise<void> {
  for (const file of files) {
    const slot: Slot = names.has("before") ? "after" : "before";
    names.set(slot, file.name);
    const request: ParseRequest = { slot, name: file.name, bytes: await file.arrayBuffer() };
    worker.postMessage(request, [request.bytes]);
  }
}

function show(view: Node): void {
  app.replaceChildren(view);
}

function required(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`no ${selector} in the page`);
  return element;
}

function message(text: string): Node {
  const paragraph = document.createElement("p");
  paragraph.className = "drop-hint";
  paragraph.textContent = text;
  return paragraph;
}
