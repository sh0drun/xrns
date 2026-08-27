import { formatNote } from "@xrns/core/domain/note.js";
import { linesAt } from "@xrns/core/domain/pattern.js";
import type { AlignedTrack } from "@xrns/core/diff/align-tracks.js";
import type {
  EffectCellChange,
  NoteCellChange,
  PatternDiff,
  TrackContentDiff,
} from "@xrns/core/diff/diff-pattern.js";
import type { EffectColumn, NoteColumn } from "@xrns/core/domain/line.js";
import type { Pattern, PatternTrack } from "@xrns/core/domain/pattern.js";

export interface PatternView {
  readonly from: Pattern;
  readonly to: Pattern;
  readonly diff: PatternDiff;
  /** A slot in the diff resolves through this to a track index in each pattern */
  readonly alignment: readonly AlignedTrack[];
  /** Both values, since the two songs can disagree about how long a beat is */
  readonly linesPerBeat: { readonly from: number; readonly to: number };
  /** Track names by aligned slot */
  readonly names: readonly string[];
}

/** Lines kept either side of an edit, so a change is never read out of context */
const CONTEXT_LINES = 2;

/** A run of untouched lines longer than this is worth hiding */
const COLLAPSE_ABOVE = 8;

const EMPTY_NOTE = "---";
const EMPTY_PAIR = "..";

export function renderPattern(view: PatternView): Node {
  const element = document.createElement("div");
  element.className = "pattern";
  element.append(patternHeading(view));

  if (view.diff.tracks.length === 0) {
    element.append(hint("nothing differs inside this pattern"));
    return element;
  }

  for (const track of view.diff.tracks) element.append(renderTrack(view, track));
  element.append(hint("escape to go back"));
  return element;
}

function patternHeading(view: PatternView): Node {
  const heading = document.createElement("h2");
  const beats =
    view.linesPerBeat.from === view.linesPerBeat.to
      ? ""
      : `, beat grid drawn at ${String(view.linesPerBeat.to)} lines, was ${String(view.linesPerBeat.from)}`;
  heading.textContent = `pattern ${String(view.to.index)}, ${String(view.to.numberOfLines)} lines${beats}`;
  return heading;
}

function renderTrack(view: PatternView, track: TrackContentDiff): Node {
  const section = document.createElement("section");
  section.className = "track-grid";

  const name = document.createElement("h3");
  name.textContent = view.names[track.slot] ?? `slot ${String(track.slot)}`;
  section.append(name);

  if (track.aliasing.kind === "changed") {
    section.append(hint(aliasText(track.aliasing.from, track.aliasing.to)));
    return section;
  }

  const older = trackAt(view.from, view.alignment[track.slot]?.from);
  const newer = trackAt(view.to, view.alignment[track.slot]?.to);
  const shape = shapeOf(older, newer, view.to.numberOfLines);
  const changed = changedLines(track);

  const grid = document.createElement("div");
  grid.className = "lines";

  for (const run of runs(view.to.numberOfLines, changed)) {
    if (run.hidden) {
      grid.append(collapsed(run.length));
      continue;
    }
    for (let index = run.start; index < run.start + run.length; index += 1) {
      grid.append(renderLine(index, older, newer, shape, track, view.linesPerBeat.to));
    }
  }

  section.append(grid);
  return section;
}

function aliasText(from: number | undefined, to: number | undefined): string {
  if (from === undefined) return `now plays pattern ${String(to)}`;
  if (to === undefined) return `no longer plays pattern ${String(from)}`;
  return `plays pattern ${String(to)} instead of ${String(from)}`;
}

function trackAt(pattern: Pattern, index: number | undefined): PatternTrack | undefined {
  return index === undefined ? undefined : pattern.tracks[index];
}

/**
 * Which fields this track actually uses, so a track with only notes is not drawn with
 * four columns of dots
 */
interface Shape {
  readonly noteColumns: number;
  readonly effectColumns: number;
  readonly fields: ReadonlySet<keyof NoteColumn>;
}

function shapeOf(
  older: PatternTrack | undefined,
  newer: PatternTrack | undefined,
  numberOfLines: number,
): Shape {
  const fields = new Set<keyof NoteColumn>();
  let noteColumns = 0;
  let effectColumns = 0;

  for (const track of [older, newer]) {
    for (const line of track?.lines ?? []) {
      if (line.index >= numberOfLines) continue;
      noteColumns = Math.max(noteColumns, usedColumns(line.noteColumns, isUsedNote));
      effectColumns = Math.max(effectColumns, usedColumns(line.effectColumns, isUsedEffect));
      for (const column of line.noteColumns) {
        for (const field of [
          "note",
          "instrument",
          "volume",
          "panning",
          "delay",
          "effectNumber",
          "effectValue",
        ] as const) {
          if (column[field] !== undefined) fields.add(field);
        }
      }
    }
  }

  return { noteColumns, effectColumns, fields };
}

function usedColumns<T>(columns: readonly T[], used: (column: T) => boolean): number {
  let last = 0;
  for (const [index, column] of columns.entries()) if (used(column)) last = index + 1;
  return last;
}

function isUsedNote(column: NoteColumn): boolean {
  return Object.values(column).some((value) => value !== undefined);
}

function isUsedEffect(column: { number?: string; value?: string }): boolean {
  return column.number !== undefined || column.value !== undefined;
}

function changedLines(track: TrackContentDiff): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const change of track.notes) lines.add(change.line);
  for (const change of track.effects) lines.add(change.line);
  return lines;
}

interface Run {
  readonly start: number;
  readonly length: number;
  readonly hidden: boolean;
}

/** Lines split into what is shown and what is folded away, in order */
function runs(numberOfLines: number, changed: ReadonlySet<number>): Run[] {
  const shown = new Set<number>();
  for (const line of changed) {
    for (let near = line - CONTEXT_LINES; near <= line + CONTEXT_LINES; near += 1) {
      if (near >= 0 && near < numberOfLines) shown.add(near);
    }
  }

  const result: Run[] = [];
  let start = 0;
  while (start < numberOfLines) {
    const visible = shown.has(start);
    let length = 1;
    while (start + length < numberOfLines && shown.has(start + length) === visible) length += 1;
    result.push({ start, length, hidden: !visible && length > COLLAPSE_ABOVE });
    start += length;
  }

  return result;
}

function collapsed(length: number): Node {
  const element = document.createElement("div");
  element.className = "fold";
  element.textContent = `${String(length)} lines unchanged`;
  return element;
}

function renderLine(
  index: number,
  older: PatternTrack | undefined,
  newer: PatternTrack | undefined,
  shape: Shape,
  track: TrackContentDiff,
  linesPerBeat: number,
): Node {
  const element = document.createElement("div");
  element.className = "line";
  if (index % linesPerBeat === 0) element.classList.add("beat");

  const number = document.createElement("span");
  number.className = "line-index";
  number.textContent = String(index).padStart(3, "0");
  element.append(number);

  const notes = track.notes.filter((change) => change.line === index);
  const effects = track.effects.filter((change) => change.line === index);
  const states = document.createElement("div");
  states.className = "states";

  if (notes.length === 0 && effects.length === 0) {
    states.append(state(newer, index, shape, [], [], "only"));
  } else {
    element.classList.add("changed");
    states.append(state(older, index, shape, notes, effects, "before"));
    states.append(state(newer, index, shape, notes, effects, "after"));
  }

  element.append(states);
  return element;
}

function state(
  track: PatternTrack | undefined,
  index: number,
  shape: Shape,
  notes: readonly NoteCellChange[],
  effects: readonly EffectCellChange[],
  side: "before" | "after" | "only",
): Node {
  const element = document.createElement("div");
  element.className = `state ${side}`;

  const line = track === undefined ? undefined : linesAt(track, index)[0];

  for (let column = 0; column < shape.noteColumns; column += 1) {
    const change = notes.find((candidate) => candidate.column === column);
    element.append(noteCell(line?.noteColumns[column], shape, change, side));
  }

  for (let column = 0; column < shape.effectColumns; column += 1) {
    const change = effects.find((candidate) => candidate.column === column);
    element.append(effectCell(line?.effectColumns[column], change, side));
  }

  return element;
}

function noteCell(
  column: NoteColumn | undefined,
  shape: Shape,
  change: NoteCellChange | undefined,
  side: string,
): Node {
  const cell = document.createElement("span");
  cell.className = "note-cell";
  if (change !== undefined && side !== "only") cell.classList.add("cell-changed");

  const note = column?.note === undefined ? EMPTY_NOTE : formatNote(column.note);
  cell.append(field(note, noteMoved(change, "note")));

  for (const name of [
    "instrument",
    "volume",
    "panning",
    "delay",
    "effectNumber",
    "effectValue",
  ] as const) {
    if (!shape.fields.has(name)) continue;
    cell.append(field(column?.[name] ?? EMPTY_PAIR, noteMoved(change, name)));
  }

  return cell;
}

function effectCell(
  column: EffectColumn | undefined,
  change: EffectCellChange | undefined,
  side: string,
): Node {
  const cell = document.createElement("span");
  cell.className = "effect-cell";
  if (change !== undefined && side !== "only") cell.classList.add("cell-changed");

  cell.append(field(column?.number ?? EMPTY_PAIR, effectMoved(change, "number")));
  cell.append(field(column?.value ?? EMPTY_PAIR, effectMoved(change, "value")));
  return cell;
}

function noteMoved(change: NoteCellChange | undefined, name: keyof NoteColumn): boolean {
  return change?.kind === "changed" && change.fields.includes(name);
}

function effectMoved(change: EffectCellChange | undefined, name: keyof EffectColumn): boolean {
  return change?.kind === "changed" && change.fields.includes(name);
}

function field(text: string, moved: boolean): Node {
  const element = document.createElement("span");
  element.className = "field";
  if (moved) element.classList.add("moved");
  element.textContent = text;
  return element;
}

function hint(text: string): Node {
  const paragraph = document.createElement("p");
  paragraph.className = "drop-hint";
  paragraph.textContent = text;
  return paragraph;
}
