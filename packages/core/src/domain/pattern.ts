import type { Line } from "./line.js";

/**
 * One track's content within one pattern. `trackIndex` addresses the song's track
 * list, which is positionally aligned with the pattern's.
 */
export interface PatternTrack {
  readonly trackIndex: number;
  /**
   * Set when this track's content is an alias of another pattern's. Absent for the
   * normal case, which the file spells as -1. An aliased track is a view of somewhere
   * else, so writing to it would edit a pattern the caller did not name.
   */
  readonly aliasPatternIndex?: number;
  /**
   * Sparse and in document order: only lines that have content are present.
   *
   * An index may repeat. No song Renoise wrote has a repeated one, but files exist
   * that do — two of the fixtures carry sixty each — and Renoise opens them, so the
   * reader has to as well. What Renoise displays for such a line is unverified, and
   * rather than guess a merge rule the entries are kept exactly as the file has them.
   */
  readonly lines: readonly Line[];
}

export interface Pattern {
  readonly index: number;
  readonly name?: string;
  readonly numberOfLines: number;
  readonly tracks: readonly PatternTrack[];
}

export function isAliased(track: PatternTrack): boolean {
  return track.aliasPatternIndex !== undefined;
}

/**
 * Every entry at `index`, in document order. Returns a list rather than one line
 * because indices can repeat; taking only the first would silently drop content.
 */
export function linesAt(track: PatternTrack, index: number): readonly Line[] {
  return track.lines.filter((line) => line.index === index);
}

/** True where the track has more than one entry for some line, which a writer must not produce. */
export function hasRepeatedLineIndices(track: PatternTrack): boolean {
  return new Set(track.lines.map((line) => line.index)).size !== track.lines.length;
}
