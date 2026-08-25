import type { Note } from "./note.js";

/**
 * A column field exactly as the file spells it.
 *
 * Volume and Panning hold either a hex level or a two character effect command such
 * as R6 (retrigger) or Y8 (maybe), so they are not numbers and are never decoded as
 * such. The rest are carried the same way for consistency, and because a value read
 * verbatim is a value that can be written back unchanged.
 *
 * Reads are permissive: whatever the file says is what the caller gets. Validation
 * belongs on the write side, where a wrong value damages a song rather than merely
 * describing one oddly.
 */
export type ColumnValue = string;

export interface NoteColumn {
  readonly note?: Note;
  readonly instrument?: ColumnValue;
  readonly volume?: ColumnValue;
  readonly panning?: ColumnValue;
  readonly delay?: ColumnValue;
  /** The per-column sample effect, distinct from the track's effect columns. */
  readonly effectNumber?: ColumnValue;
  readonly effectValue?: ColumnValue;
}

export interface EffectColumn {
  readonly number?: ColumnValue;
  readonly value?: ColumnValue;
}

/**
 * Lines are sparse in the file, so a Line carries the index it sits at rather than
 * being found by its position in a list.
 *
 * Columns are the opposite: they are positional, and an empty one is a placeholder
 * holding a position rather than an absence. Both arrays therefore include their
 * empty entries.
 */
export interface Line {
  readonly index: number;
  readonly noteColumns: readonly NoteColumn[];
  readonly effectColumns: readonly EffectColumn[];
}

export function isEmptyNoteColumn(column: NoteColumn): boolean {
  return (
    column.note === undefined &&
    column.instrument === undefined &&
    column.volume === undefined &&
    column.panning === undefined &&
    column.delay === undefined &&
    column.effectNumber === undefined &&
    column.effectValue === undefined
  );
}

export function isEmptyEffectColumn(column: EffectColumn): boolean {
  return column.number === undefined && column.value === undefined;
}

export function isEmptyLine(line: Line): boolean {
  return line.noteColumns.every(isEmptyNoteColumn) && line.effectColumns.every(isEmptyEffectColumn);
}
