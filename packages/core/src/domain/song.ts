import type { Instrument } from "./instrument.js";
import type { Pattern } from "./pattern.js";
import type { SequenceEntry } from "./sequence.js";
import type { Track } from "./track.js";

/**
 * A read view of a song.
 *
 * Deliberately partial. The file also holds phrases, modulation sets, filter devices
 * and automation, none of which are modelled here, and a song is never rebuilt from
 * this type. Edits are applied to the retained document instead, so what is missing
 * from this view is preserved rather than lost.
 */
export interface Song {
  readonly docVersion: number;
  readonly name: string;
  readonly artist: string;
  readonly beatsPerMinute: number;
  readonly linesPerBeat: number;
  readonly ticksPerLine: number;
  readonly tracks: readonly Track[];
  readonly instruments: readonly Instrument[];
  readonly patterns: readonly Pattern[];
  readonly sequence: readonly SequenceEntry[];
}

export function trackAt(song: Song, index: number): Track | undefined {
  return song.tracks[index];
}

export function patternAt(song: Song, index: number): Pattern | undefined {
  return song.patterns[index];
}

/** How many lines make one beat's worth of a bar, for turning bars into line indices. */
export function linesPerBar(song: Song, beatsPerBar: number): number {
  return song.linesPerBeat * beatsPerBar;
}
