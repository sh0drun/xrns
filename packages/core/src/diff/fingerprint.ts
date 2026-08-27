import { isEmptyEffectColumn, isEmptyLine, isEmptyNoteColumn } from "../domain/line.js";
import type { EffectColumn, Line, NoteColumn } from "../domain/line.js";
import type { Note } from "../domain/note.js";
import type { PatternTrack } from "../domain/pattern.js";

/** What a track holding nothing fingerprints as, derived so it cannot drift from the format */
export const NO_TRACK_CONTENT = fingerprintTrack({ trackIndex: 0, lines: [] }, 0);

/**
 * Two tracks with the same fingerprint hold the same music
 *
 * Name, content past the pattern's end and trailing empty columns all stay out, so none
 * of them can make an unchanged track look changed
 */
export function fingerprintTrack(track: PatternTrack, numberOfLines: number): string {
  if (track.aliasPatternIndex !== undefined) {
    return JSON.stringify(["alias", track.aliasPatternIndex]);
  }

  const lines = track.lines
    .filter((line) => line.index < numberOfLines && !isEmptyLine(line))
    .map(serializeLine);

  return JSON.stringify(lines);
}

/**
 * Takes fingerprints already in a shared order rather than a Pattern
 *
 * A pattern's own track list is positional, so inserting one track in the song shifts
 * every pattern and the whole song reads as rewritten
 */
export function fingerprintPattern(numberOfLines: number, tracks: readonly string[]): string {
  return JSON.stringify([numberOfLines, tracks]);
}

/** Where an aliased track's identity sits, since it has no lines of its own */
const ALIAS_LINE = -1;

/**
 * One key per line that holds something, for judging how alike two tracks are
 *
 * A whole-track fingerprint says only same or different, which makes a track with one
 * edited cell look as unrelated as a track that was rewritten
 */
export function lineKeys(track: PatternTrack, numberOfLines: number): ReadonlyMap<number, string> {
  if (track.aliasPatternIndex !== undefined) {
    return new Map([[ALIAS_LINE, JSON.stringify(["alias", track.aliasPatternIndex])]]);
  }

  const keys = new Map<number, string>();
  for (const line of track.lines) {
    if (line.index >= numberOfLines || isEmptyLine(line)) continue;
    const serialized = JSON.stringify(serializeLine(line));
    const existing = keys.get(line.index);
    keys.set(line.index, existing === undefined ? serialized : existing + serialized);
  }

  return keys;
}

function serializeLine(line: Line): unknown[] {
  return [
    line.index,
    withoutTrailingEmpty(line.noteColumns, isEmptyNoteColumn).map(serializeNoteColumn),
    withoutTrailingEmpty(line.effectColumns, isEmptyEffectColumn).map(serializeEffectColumn),
  ];
}

function serializeNoteColumn(column: NoteColumn): unknown[] {
  return [
    noteKey(column.note),
    column.instrument ?? null,
    column.volume ?? null,
    column.panning ?? null,
    column.delay ?? null,
    column.effectNumber ?? null,
    column.effectValue ?? null,
  ];
}

function serializeEffectColumn(column: EffectColumn): unknown[] {
  return [column.number ?? null, column.value ?? null];
}

function noteKey(note: Note | undefined): string | number | null {
  if (note === undefined) return null;
  return note.kind === "off" ? "off" : note.semitone;
}

/** Only trailing ones can go since an empty column between two used ones holds a position */
function withoutTrailingEmpty<T>(
  columns: readonly T[],
  isEmpty: (item: T) => boolean,
): readonly T[] {
  let end = columns.length;
  while (end > 0) {
    const column = columns[end - 1];
    if (column === undefined || !isEmpty(column)) break;
    end -= 1;
  }
  return columns.slice(0, end);
}
