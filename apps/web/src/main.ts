import type { ParseRequest, ParseResult } from "./parse-worker.js";
import { renderSong } from "./render-song.js";

const app = required("#app");

const worker = new Worker(new URL("./parse-worker.ts", import.meta.url), { type: "module" });

worker.onmessage = (event: MessageEvent<ParseResult>) => {
  const result = event.data;
  if (result.kind === "failed") {
    show(message(`${result.name} ${result.message}`));
    return;
  }
  show(renderSong(result.name, result.song));
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

  const file = event.dataTransfer?.files.item(0);
  if (!file) return;

  show(message(`reading ${file.name}`));
  void parse(file);
});

async function parse(file: File): Promise<void> {
  const request: ParseRequest = { name: file.name, bytes: await file.arrayBuffer() };
  worker.postMessage(request, [request.bytes]);
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
