import type { NoteColumn } from "../domain/line.js";
import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";

/** One instrument a track plays, and how many of its notes belong to it */
export interface TrackInstrument {
  readonly instrument: number;
  readonly notes: number;
}

/**
 * What a track plays, counted across the song as it is arranged
 *
 * A pattern that sits at eight positions counts eight times, so the numbers are notes
 * heard rather than notes typed, which is the same weighting the arrangement map uses
 */
export interface TrackUse {
  readonly track: number;
  readonly notes: number;
  /**
   * Notes in a column that never named an instrument
   *
   * Renoise plays those on whatever the column used last, which reaches back into
   * whichever pattern ran before this one. A pattern can sit at several positions with
   * different predecessors, so there is no single answer, and attributing them to a
   * guess would be worse than leaving them out. Two percent of Renoise's demo library
   */
  readonly unknown: number;
  /** Busiest first */
  readonly instruments: readonly TrackInstrument[];
}

/** Which instruments each track plays, from the note columns rather than the mixer */
export function instrumentUse(song: Song): TrackUse[] {
  const counts = song.tracks.map(() => new Map<number, number>());
  const unknown = song.tracks.map(() => 0);

  for (const [patternIndex, times] of occurrences(song)) {
    const pattern = song.patterns[patternIndex];
    if (pattern === undefined) continue;

    for (const track of pattern.tracks) {
      const into = counts[track.trackIndex];
      const from = source(track, pattern, song);
      if (into === undefined || from === undefined) continue;

      const missing = count(from.track, from.numberOfLines, into, times);
      unknown[track.trackIndex] = (unknown[track.trackIndex] ?? 0) + missing * times;
    }
  }

  return song.tracks.map((track, index) => {
    const played = counts[index] ?? new Map<number, number>();
    const instruments = [...played]
      .map(([instrument, notes]) => ({ instrument, notes }))
      .sort((a, b) => b.notes - a.notes || a.instrument - b.instrument);

    return {
      track: track.index,
      notes: instruments.reduce((total, one) => total + one.notes, 0),
      unknown: unknown[index] ?? 0,
      instruments,
    };
  });
}

/**
 * How many times each pattern plays
 *
 * Counting a pattern once and multiplying costs one walk per pattern instead of one
 * per position, which matters on a song whose sequence is long
 */
function occurrences(song: Song): Map<number, number> {
  const times = new Map<number, number>();
  for (const entry of song.sequence) {
    times.set(entry.patternIndex, (times.get(entry.patternIndex) ?? 0) + 1);
  }
  return times;
}

interface Source {
  readonly track: PatternTrack;
  readonly numberOfLines: number;
}

/** An alias plays another pattern's content, and only one hop is followed */
function source(track: PatternTrack, pattern: Pattern, song: Song): Source | undefined {
  if (track.aliasPatternIndex === undefined) {
    return { track, numberOfLines: pattern.numberOfLines };
  }

  const target = song.patterns[track.aliasPatternIndex];
  const aliased = target?.tracks[track.trackIndex];
  if (target === undefined || aliased === undefined || aliased.aliasPatternIndex !== undefined) {
    return undefined;
  }

  return { track: aliased, numberOfLines: target.numberOfLines };
}

/**
 * Notes per instrument, with the column's last named instrument carried down
 *
 * Trackers only spell the instrument where it changes, so 19 percent of the notes in
 * Renoise's library name none and would otherwise go uncounted. Returns how many were
 * left with nothing to inherit
 */
function count(
  track: PatternTrack,
  numberOfLines: number,
  into: Map<number, number>,
  times: number,
): number {
  const last = new Map<number, number>();
  let unknown = 0;

  for (const line of [...track.lines].sort((a, b) => a.index - b.index)) {
    if (line.index >= numberOfLines) continue;

    for (const [column, cell] of line.noteColumns.entries()) {
      const named = instrumentOf(cell);
      if (named !== undefined) last.set(column, named);
      if (cell.note?.kind !== "pitch") continue;

      const instrument = last.get(column);
      if (instrument === undefined) {
        unknown += 1;
        continue;
      }
      into.set(instrument, (into.get(instrument) ?? 0) + times);
    }
  }

  return unknown;
}

/** The column holds two hex digits, which is how Renoise numbers instruments */
function instrumentOf(column: NoteColumn): number | undefined {
  if (column.instrument === undefined) return undefined;
  const value = Number.parseInt(column.instrument, 16);
  return Number.isInteger(value) ? value : undefined;
}
