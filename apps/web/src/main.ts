import { renderDiff } from "./render-diff.js";
import { renderPattern } from "./render-pattern.js";
import { renderSlots } from "./render-slots.js";
import { renderSong } from "./render-song.js";
import type { SongMap } from "@xrns/core/analysis/song-map.js";
import type { SongDiff } from "@xrns/core/diff/song-diff.js";
import type { ParseRequest, PatternRequest, Slot, WorkerMessage } from "./parse-worker.js";

const files = required("#files");
const app = required("#app");

const worker = new Worker(new URL("./parse-worker.ts", import.meta.url), { type: "module" });

const names = new Map<Slot, string>();
let songDiff: SongDiff | undefined;
let songMap: SongMap | undefined;

showSlots();

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const result = event.data;

  if (result.kind === "failed") {
    names.delete(result.slot);
    showSlots();
    show(message(`${result.name} ${result.message}`));
    return;
  }

  if (result.kind === "song") {
    if (names.size === 1) show(renderSong(result.name, result.song, result.map));
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
  songMap = result.map;
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

  for (const file of [...(event.dataTransfer?.files ?? [])]) load(nextSlot(), file);
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

/**
 * A drop on the page rather than on a slot fills whichever is empty
 *
 * With both taken it replaces the newer one, since comparing a fresh save against the
 * same older file is the thing you do repeatedly
 */
function nextSlot(): Slot {
  return names.has("before") ? "after" : "before";
}

function load(slot: Slot, file: File): void {
  names.set(slot, file.name);
  showSlots();
  show(message(`reading ${file.name}`));
  void send(slot, file);
}

async function send(slot: Slot, file: File): Promise<void> {
  const request: ParseRequest = {
    kind: "parse",
    slot,
    name: file.name,
    bytes: await file.arrayBuffer(),
  };
  worker.postMessage(request, [request.bytes]);
}

function openPattern(target: EventTarget | null): void {
  const row = target instanceof Element ? target.closest(".open") : null;
  if (!(row instanceof HTMLElement)) return;

  const from = Number(row.dataset.from);
  const to = Number(row.dataset.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;

  const request: PatternRequest = { kind: "pattern", from, to };
  worker.postMessage(request);
}

function showSlots(): void {
  files.replaceChildren(renderSlots(names, load));
}

function showDiff(): void {
  if (songDiff === undefined || songMap === undefined) return;
  show(renderDiff(songDiff, songMap));
}

/** Aligned track names, by slot, taken from the song diff the page already holds */
function trackNames(): string[] {
  return (songDiff?.tracks ?? []).map((change) => {
    if (change.kind !== "kept") return change.track.name;
    return change.name.kind === "same" ? change.name.value : change.name.to;
  });
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
