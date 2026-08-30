import type { SequenceEntry } from "../domain/sequence.js";
import type { Track, TrackType } from "../domain/track.js";
import type { InstrumentMatch } from "./diff-instruments.js";

/**
 * Changes carry their values, so a diff reads on its own without either song
 * A pattern is the exception, it is named rather than carried, or an added pattern
 * would put most of a song's content in the summary
 */

export type Change<T> = Same<T> | Changed<T>;

export interface Same<T> {
  readonly kind: "same";
  readonly value: T;
}

export interface Changed<T> {
  readonly kind: "changed";
  readonly from: T;
  readonly to: T;
}

export function change<T extends string | number>(from: T, to: T): Change<T> {
  return from === to ? { kind: "same", value: to } : { kind: "changed", from, to };
}

export interface PatternRef {
  readonly index: number;
  readonly name?: string;
  readonly numberOfLines: number;
}

export interface MetaDiff {
  readonly docVersion: Change<number>;
  readonly name: Change<string>;
  readonly artist: Change<string>;
  readonly beatsPerMinute: Change<number>;
  readonly linesPerBeat: Change<number>;
  readonly ticksPerLine: Change<number>;
}

export interface TrackAdded {
  readonly kind: "added";
  readonly track: Track;
}

export interface TrackRemoved {
  readonly kind: "removed";
  readonly track: Track;
}

/** Matched on name and type, so the type is equal on both sides and is here to display
 *
 */
export interface TrackKept {
  readonly kind: "kept";
  readonly type: TrackType;
  readonly index: Change<number>;
  readonly name: Change<string>;
  readonly visibleNoteColumns: Change<number>;
  readonly visibleEffectColumns: Change<number>;
}

export type TrackChange = TrackAdded | TrackRemoved | TrackKept;

export interface SequenceKept {
  readonly kind: "kept";
  readonly from: SequenceEntry;
  readonly to: SequenceEntry;
}

export interface SequenceInserted {
  readonly kind: "inserted";
  readonly to: SequenceEntry;
}

export interface SequenceRemoved {
  readonly kind: "removed";
  readonly from: SequenceEntry;
}

export type SequenceChange = SequenceKept | SequenceInserted | SequenceRemoved;

export interface PatternAdded {
  readonly kind: "added";
  readonly to: PatternRef;
}

export interface PatternRemoved {
  readonly kind: "removed";
  readonly from: PatternRef;
}

export interface PatternIdentical {
  readonly kind: "identical";
  readonly from: PatternRef;
  readonly to: PatternRef;
}

/** similarity is carried so a weak pairing shows as weak rather than as a plain result
 */
export interface PatternModified {
  readonly kind: "modified";
  readonly from: PatternRef;
  readonly to: PatternRef;
  readonly similarity: number;
  readonly numberOfLines: Change<number>;

  /** Positions in the aligned track list, not indices into either song */
  readonly changedTracks: readonly number[];
}

export type PatternMatch = PatternAdded | PatternRemoved | PatternIdentical | PatternModified;

export interface SongDiff {
  readonly meta: MetaDiff;
  readonly tracks: readonly TrackChange[];
  readonly instruments: readonly InstrumentMatch[];
  readonly sequence: readonly SequenceChange[];
  readonly patterns: readonly PatternMatch[];
}
