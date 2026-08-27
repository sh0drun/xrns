import { renderDiff } from "./render-diff.js";
import { renderPattern } from "./render-pattern.js";
import { renderSong } from "./render-song.js";
import type { SongDiff } from "@xrns/core/diff/song-diff.js";
import type { ParseRequest, PatternRequest, Slot, WorkerMessage } from "./parse-worker.js";

const app = required("#app");

const worker = new Worker(new URL("./parse-worker.ts", import.meta.url), { type: "module" });

const names = new Map<Slot, string>();
let songDiff: SongDiff | undefined;

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

  if (result.kind === "pattern") {
    show(
      renderPattern({
        from: result.from,
        to: result.to,
        diff: result.diff,
        alignment: result.alignment,
        linesPerBeat: result.linesPerBeat,
        names: trackNames(),
      }),
    );
    return;
  }

  songDiff = result.diff;
  showDiff();
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

// Delegated from #app, which outlives every view swap
app.addEventListener("click", (event) => {
  openPattern(event.target);
});

app.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openPattern(event.target);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") showDiff();
});

function openPattern(target: EventTarget | null): void {
  const row = target instanceof Element ? target.closest(".open") : null;
  if (!(row instanceof HTMLElement)) return;

  const from = Number(row.dataset.from);
  const to = Number(row.dataset.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;

  const request: PatternRequest = { kind: "pattern", from, to };
  worker.postMessage(request);
}

/** Aligned track names, by slot, taken from the song diff the page already holds */
function trackNames(): string[] {
  return (songDiff?.tracks ?? []).map((change) => {
    if (change.kind !== "kept") return change.track.name;
    return change.name.kind === "same" ? change.name.value : change.name.to;
  });
}

function showDiff(): void {
  if (songDiff === undefined) return;
  show(renderDiff(names.get("before") ?? "", names.get("after") ?? "", songDiff));
}

/**
 * The first file dropped is the older one and the second is the newer, rather than the
 * page guessing from a file name or a timestamp
 */
async function load(files: readonly File[]): Promise<void> {
  for (const file of files) {
    const slot: Slot = names.has("before") ? "after" : "before";
    names.set(slot, file.name);
    const request: ParseRequest = {
      kind: "parse",
      slot,
      name: file.name,
      bytes: await file.arrayBuffer(),
    };
    worker.postMessage(request, [request.bytes]);
  }
}

function show(view: Node): void {
  app.replaceChildren(view);
}

function required(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`no ${selector} in the page`);
  return element;
}

function message(text: string): Node {
  const paragraph = document.createElement("p");
  paragraph.className = "drop-hint";
  paragraph.textContent = text;
  return paragraph;
}
