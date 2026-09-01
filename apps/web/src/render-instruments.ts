import type {
  InstrumentMatch,
  SampleField,
  SampleFieldChange,
  SampleMatch,
} from "@xrns/core/diff/diff-instruments.js";
import type { InstrumentRow, Instruments } from "./parse-worker.js";

const LABELS: Record<SampleField, string> = {
  name: "name",
  volume: "volume",
  panning: "panning",
  transpose: "transpose",
  finetune: "finetune",
  loopMode: "loop",
  loopStart: "loop start",
  loopEnd: "loop end",
  baseNote: "base note",
  noteStart: "from key",
  noteEnd: "to key",
  velocityStart: "from velocity",
  velocityEnd: "to velocity",
};

/** Beyond this many samples arriving or leaving at once, the names stop telling you anything */
const NAMED_SAMPLES = 3;

/** What changed about the instruments themselves, for a diff of two songs */
export function renderInstrumentChanges(changes: readonly InstrumentMatch[]): Node {
  const element = document.createElement("section");

  const heading = document.createElement("h2");
  heading.textContent = "instruments";

  element.append(heading, changeList(changes));
  return element;
}

function changeList(changes: readonly InstrumentMatch[]): Node {
  const list = document.createElement("ol");
  list.className = "changes";

  for (const match of changes) {
    if (match.kind !== "identical") list.append(changeRow(match));
  }
  if (list.childElementCount === 0) list.append(quiet("no instrument changed"));

  return list;
}

function changeRow(match: InstrumentMatch): Node {
  const item = document.createElement("li");

  if (match.kind === "added" || match.kind === "removed") {
    const mark = match.kind === "added" ? "+" : "-";
    item.className = `row ${match.kind}`;
    item.textContent = `${mark} ${slot(match.index)} ${named(match.instrument.name, match.instrument.samples[0]?.name)}`;
    return item;
  }

  if (match.kind === "identical") {
    item.className = "row quiet";
    return item;
  }

  item.className = "row changed";
  const name =
    match.name.kind === "changed" ? `${match.name.from} → ${match.name.to}` : match.name.value;
  item.textContent = `~ ${slot(match.index)} ${name}`;
  item.append(...sampleDetails(match.samples));

  return item;
}

/**
 * Edited samples are always named, arrivals and departures only in small numbers
 *
 * A kit swapped wholesale loses forty samples at once, and forty names is a wall that
 * buries the one field somebody actually changed
 */
function sampleDetails(samples: readonly SampleMatch[]): Node[] {
  const edited = samples.filter((one) => one.kind === "modified");
  const gained = samples.filter((one) => one.kind === "added");
  const lost = samples.filter((one) => one.kind === "removed");

  return [...edited.map(editedDetail), ...summarised("+", gained), ...summarised("-", lost)];
}

/** A renamed sample leads with both names, so printing the name field again says it twice */
function editedDetail(match: SampleMatch): Node {
  if (match.kind !== "modified") return detail(sampleName(match));

  const renamed = match.fields.find((one) => one.field === "name");
  const rest = match.fields.filter((one) => one.field !== "name");
  const label =
    renamed === undefined ? match.name : `${String(renamed.from)} → ${String(renamed.to)}`;

  return detail(rest.length === 0 ? label : `${label}  ${rest.map(field).join(", ")}`);
}

function summarised(mark: string, samples: readonly SampleMatch[]): Node[] {
  if (samples.length === 0) return [];
  if (samples.length <= NAMED_SAMPLES) {
    return samples.map((one) => detail(`${mark} ${sampleName(one)}`));
  }
  return [detail(`${mark} ${String(samples.length)} samples`)];
}

function sampleName(match: SampleMatch): string {
  return match.kind === "modified" ? match.name : match.sample.name;
}

function detail(text: string): Node {
  const element = document.createElement("div");
  element.className = "row-detail";
  element.textContent = text;
  return element;
}

function field(one: SampleFieldChange): string {
  return `${LABELS[one.field]} ${String(one.from)} → ${String(one.to)}`;
}

/** Renoise numbers instruments in hex, so the slot reads the way it does in the tracker */
function slot(index: number): string {
  return index.toString(16).toUpperCase().padStart(2, "0");
}

/** An instrument can carry samples and no name of its own, so the first sample stands in */
function named(name: string, fallback: string | undefined): string {
  if (name !== "") return name;
  return fallback ?? "";
}

function quiet(text: string): Node {
  const item = document.createElement("li");
  item.className = "row quiet";
  item.textContent = text;
  return item;
}

/**
 * Which instrument each track plays
 *
 * Nineteen of Tension's twenty tracks play exactly one, so the mapping is what carries
 * the information and a share only prints where a track splits. The note count is the
 * second reading: it says which tracks the song is actually built on
 */
export function renderTrackInstruments(instruments: Instruments): Node {
  const element = document.createElement("section");
  element.className = "instruments";

  const heading = document.createElement("h2");
  heading.textContent = "track instruments";

  element.append(heading, body(instruments));
  return element;
}

function body(instruments: Instruments): Node {
  const named = instruments.rows.some((row) => row.instruments.length > 0);
  return named ? rows(instruments.rows) : catalog(instruments.catalog);
}

function rows(all: readonly InstrumentRow[]): Node {
  const list = document.createElement("ol");
  list.className = "instrument-rows";

  const busiest = Math.max(1, ...all.map((row) => row.notes));
  for (const row of all) list.append(renderRow(row, busiest));

  return list;
}

/**
 * The fallback for a song whose notes never name an instrument
 *
 * Every track's row would read "unknown", which is a table saying nothing, so the
 * instrument list itself is the better answer
 */
function catalog(names: readonly string[]): Node {
  const list = document.createElement("ol");
  list.className = "instrument-catalog";

  for (const name of names) {
    const item = document.createElement("li");
    item.textContent = name;
    list.append(item);
  }

  return list;
}

function renderRow(row: InstrumentRow, busiest: number): Node {
  const item = document.createElement("li");
  item.className = "instrument-row";

  const track = document.createElement("span");
  track.className = "instrument-track";
  track.title = row.track;
  if (row.color !== undefined) track.append(chip(row.color));
  track.append(row.track);

  item.append(track, played(row), weight(row.notes, busiest));
  return item;
}

/**
 * The colour the composer sees on this track in Renoise
 *
 * Kept to a character so it reads as recognition rather than as meaning: density is
 * already luminance and the accent already means changed
 */
function chip(color: string): Node {
  const element = document.createElement("span");
  element.className = "track-chip";
  element.style.setProperty("--color", color);
  return element;
}

function played(row: InstrumentRow): Node {
  const element = document.createElement("span");
  element.className = "instrument-played";

  for (const one of row.instruments) {
    element.append(name(one.name, row.instruments.length > 1 ? one.notes / row.notes : undefined));
  }
  if (row.unknown > 0) element.append(dim(`${String(row.unknown)} unattributed`));
  if (row.instruments.length === 0 && row.unknown === 0) element.append(dim("unknown"));

  return element;
}

function name(text: string, share: number | undefined): Node {
  const element = document.createElement("span");
  element.className = "instrument-name";
  element.textContent = text;

  if (share !== undefined) {
    element.append(" ", dim(`${String(Math.round(share * 100))}%`));
  }

  return element;
}

/** The bar is a gradient stop rather than an element, the same way the map's totals are */
function weight(notes: number, busiest: number): Node {
  const element = document.createElement("span");
  element.className = "instrument-weight";
  element.style.setProperty("--share", (notes / busiest).toFixed(3));
  element.textContent = String(notes);
  return element;
}

function dim(text: string): Node {
  const element = document.createElement("span");
  element.className = "instrument-note";
  element.textContent = text;
  return element;
}
