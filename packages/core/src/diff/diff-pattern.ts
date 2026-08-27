import { isEmptyEffectColumn, isEmptyNoteColumn } from "../domain/line.js";
import type { EffectColumn, Line, NoteColumn } from "../domain/line.js";
import type { Note } from "../domain/note.js";
import { linesAt } from "../domain/pattern.js";
import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { AlignedTrack } from "./align-tracks.js";

export type NoteField = keyof NoteColumn;
export type EffectField = keyof EffectColumn;

const NOTE_FIELDS: readonly NoteField[] = [
  "note",
  "instrument",
  "volume",
  "panning",
  "delay",
  "effectNumber",
  "effectValue",
];

const EFFECT_FIELDS: readonly EffectField[] = ["number", "value"];

export interface CellAt {
  readonly line: number;
  readonly column: number;
}

export type NoteCellChange =
  | (CellAt & { readonly kind: "added"; readonly to: NoteColumn })
  | (CellAt & { readonly kind: "removed"; readonly from: NoteColumn })
  | (CellAt & {
      readonly kind: "changed";
      readonly from: NoteColumn;
      readonly to: NoteColumn;
      /** Which parts of the cell moved, so a volume edit does not read as a new note */
      readonly fields: readonly NoteField[];
    });

export type EffectCellChange =
  | (CellAt & { readonly kind: "added"; readonly to: EffectColumn })
  | (CellAt & { readonly kind: "removed"; readonly from: EffectColumn })
  | (CellAt & {
      readonly kind: "changed";
      readonly from: EffectColumn;
      readonly to: EffectColumn;
      readonly fields: readonly EffectField[];
    });

/**
 * An aliased track plays another pattern's content, so the diff reports the relationship
 * rather than following it
 */
export type Aliasing =
  | { readonly kind: "none" }
  | { readonly kind: "same"; readonly patternIndex: number }
  | {
      readonly kind: "changed";
      readonly from: number | undefined;
      readonly to: number | undefined;
    };

export interface TrackContentDiff {
  /** Position in the aligned track list, not an index into either song */
  readonly slot: number;
  readonly aliasing: Aliasing;
  readonly notes: readonly NoteCellChange[];
  readonly effects: readonly EffectCellChange[];
}

/**
 * Computed for one pattern when it is opened, never for the whole song
 *
 * Only tracks that differ appear, and within them only cells that differ, so unchanged
 * content is absent the way it is absent from the file
 */
export interface PatternDiff {
  readonly tracks: readonly TrackContentDiff[];
}

export function diffPattern(
  from: Pattern,
  to: Pattern,
  alignment: readonly AlignedTrack[],
): PatternDiff {
  const tracks: TrackContentDiff[] = [];

  for (const [slot, aligned] of alignment.entries()) {
    const older = aligned.from === undefined ? undefined : from.tracks[aligned.from];
    const newer = aligned.to === undefined ? undefined : to.tracks[aligned.to];
    if (older === undefined && newer === undefined) continue;

    const aliasing = compareAliasing(older, newer);
    const notes: NoteCellChange[] = [];
    const effects: EffectCellChange[] = [];

    if (aliasing.kind !== "changed" && aliasing.kind !== "same") {
      collectLines(older, from.numberOfLines, newer, to.numberOfLines, notes, effects);
    }

    if (aliasing.kind === "changed" || notes.length > 0 || effects.length > 0) {
      tracks.push({ slot, aliasing, notes, effects });
    }
  }

  return { tracks };
}

function compareAliasing(
  older: PatternTrack | undefined,
  newer: PatternTrack | undefined,
): Aliasing {
  const from = older?.aliasPatternIndex;
  const to = newer?.aliasPatternIndex;

  if (from === undefined && to === undefined) return { kind: "none" };
  if (from === to && from !== undefined) return { kind: "same", patternIndex: from };
  return { kind: "changed", from, to };
}

/**
 * Line indices are the identity here, since a pattern has a fixed length and no row can
 * be inserted into it, so there is nothing to align
 */
function collectLines(
  older: PatternTrack | undefined,
  olderLines: number,
  newer: PatternTrack | undefined,
  newerLines: number,
  notes: NoteCellChange[],
  effects: EffectCellChange[],
): void {
  const indices = new Set<number>();
  for (const line of visible(older, olderLines)) indices.add(line.index);
  for (const line of visible(newer, newerLines)) indices.add(line.index);

  for (const index of [...indices].sort((a, b) => a - b)) {
    const before = older === undefined ? [] : within(linesAt(older, index), olderLines);
    const after = newer === undefined ? [] : within(linesAt(newer, index), newerLines);

    // An index can repeat in files Renoise opens, so entries are paired in document order
    for (let entry = 0; entry < Math.max(before.length, after.length); entry += 1) {
      collectColumns(before[entry], after[entry], index, notes, effects);
    }
  }
}

function visible(track: PatternTrack | undefined, numberOfLines: number): readonly Line[] {
  return track === undefined ? [] : within(track.lines, numberOfLines);
}

/** Renoise keeps content past a shortened pattern's end, and none of it plays */
function within(lines: readonly Line[], numberOfLines: number): readonly Line[] {
  return lines.filter((line) => line.index < numberOfLines);
}

function collectColumns(
  before: Line | undefined,
  after: Line | undefined,
  line: number,
  notes: NoteCellChange[],
  effects: EffectCellChange[],
): void {
  const noteCount = Math.max(before?.noteColumns.length ?? 0, after?.noteColumns.length ?? 0);
  for (let column = 0; column < noteCount; column += 1) {
    const change = compareNoteColumn(
      before?.noteColumns[column],
      after?.noteColumns[column],
      line,
      column,
    );
    if (change !== undefined) notes.push(change);
  }

  const effectCount = Math.max(before?.effectColumns.length ?? 0, after?.effectColumns.length ?? 0);
  for (let column = 0; column < effectCount; column += 1) {
    const change = compareEffectColumn(
      before?.effectColumns[column],
      after?.effectColumns[column],
      line,
      column,
    );
    if (change !== undefined) effects.push(change);
  }
}

function compareNoteColumn(
  before: NoteColumn | undefined,
  after: NoteColumn | undefined,
  line: number,
  column: number,
): NoteCellChange | undefined {
  const older = before === undefined || isEmptyNoteColumn(before) ? undefined : before;
  const newer = after === undefined || isEmptyNoteColumn(after) ? undefined : after;

  if (older === undefined && newer === undefined) return undefined;
  if (older === undefined && newer !== undefined) return { kind: "added", line, column, to: newer };
  if (newer === undefined && older !== undefined)
    return { kind: "removed", line, column, from: older };
  if (older === undefined || newer === undefined) return undefined;

  const fields = NOTE_FIELDS.filter((field) => !sameNoteField(older, newer, field));
  return fields.length === 0
    ? undefined
    : { kind: "changed", line, column, from: older, to: newer, fields };
}

function sameNoteField(older: NoteColumn, newer: NoteColumn, field: NoteField): boolean {
  if (field === "note") return sameNote(older.note, newer.note);
  return older[field] === newer[field];
}

function sameNote(older: Note | undefined, newer: Note | undefined): boolean {
  if (older === undefined || newer === undefined) return older === newer;
  if (older.kind === "off" || newer.kind === "off") return older.kind === newer.kind;
  return older.semitone === newer.semitone;
}

function compareEffectColumn(
  before: EffectColumn | undefined,
  after: EffectColumn | undefined,
  line: number,
  column: number,
): EffectCellChange | undefined {
  const older = before === undefined || isEmptyEffectColumn(before) ? undefined : before;
  const newer = after === undefined || isEmptyEffectColumn(after) ? undefined : after;

  if (older === undefined && newer === undefined) return undefined;
  if (older === undefined && newer !== undefined) return { kind: "added", line, column, to: newer };
  if (newer === undefined && older !== undefined)
    return { kind: "removed", line, column, from: older };
  if (older === undefined || newer === undefined) return undefined;

  const fields = EFFECT_FIELDS.filter((field) => older[field] !== newer[field]);
  return fields.length === 0
    ? undefined
    : { kind: "changed", line, column, from: older, to: newer, fields };
}
