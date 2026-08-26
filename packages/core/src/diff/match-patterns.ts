import type { Pattern } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";
import type { AlignedTrack } from "./align-tracks.js";
import { NO_TRACK_CONTENT, fingerprintPattern, fingerprintTrack } from "./fingerprint.js";
import { change } from "./song-diff.js";
import type { PatternMatch, PatternRef } from "./song-diff.js";

/** Guesswork until there are real pairs of songs to run it against */
const MIN_PATTERN_SIMILARITY = 0.5;

interface Fingerprinted {
  readonly pattern: Pattern;
  /** One entry per aligned slot, so the two songs can be compared position by position */
  readonly tracks: readonly string[];
  readonly whole: string;
}

interface Pair {
  readonly older: Fingerprinted;
  readonly newer: Fingerprinted;
  readonly identical: boolean;
}

/**
 * Patterns that fingerprint the same pair off first, then whatever is left is scored
 * against everything still free and taken best first
 *
 * Needs the track alignment because a pattern's own track list is positional
 */
export function matchPatterns(
  from: Song,
  to: Song,
  alignment: readonly AlignedTrack[],
): readonly PatternMatch[] {
  const older = from.patterns.map((pattern) => fingerprinted(pattern, alignment, olderSide));
  const newer = to.patterns.map((pattern) => fingerprinted(pattern, alignment, newerSide));

  const pairs = pairIdentical(older, newer);
  pairs.push(...pairRemaining(older, newer, pairs));

  return describe(older, newer, pairs);
}

function olderSide(slot: AlignedTrack): number | undefined {
  return slot.from;
}

function newerSide(slot: AlignedTrack): number | undefined {
  return slot.to;
}

function fingerprinted(
  pattern: Pattern,
  alignment: readonly AlignedTrack[],
  side: (slot: AlignedTrack) => number | undefined,
): Fingerprinted {
  const tracks = alignment.map((slot) => {
    const index = side(slot);
    if (index === undefined) return NO_TRACK_CONTENT;
    const track = pattern.tracks[index];
    return track === undefined ? NO_TRACK_CONTENT : fingerprintTrack(track, pattern.numberOfLines);
  });

  return { pattern, tracks, whole: fingerprintPattern(pattern.numberOfLines, tracks) };
}

/** A song can hold the same pattern twice, so equal fingerprints pair in the order they appear */
function pairIdentical(older: Fingerprinted[], newer: Fingerprinted[]): Pair[] {
  const available = new Map<string, Fingerprinted[]>();
  for (const item of newer) {
    const queue = available.get(item.whole);
    if (queue === undefined) available.set(item.whole, [item]);
    else queue.push(item);
  }

  const pairs: Pair[] = [];
  for (const item of older) {
    const match = available.get(item.whole)?.shift();
    if (match !== undefined) pairs.push({ older: item, newer: match, identical: true });
  }

  return pairs;
}

function pairRemaining(older: Fingerprinted[], newer: Fingerprinted[], pairs: Pair[]): Pair[] {
  const matchedOlder = new Set(pairs.map((pair) => pair.older.pattern.index));
  const matchedNewer = new Set(pairs.map((pair) => pair.newer.pattern.index));

  const candidates: { older: Fingerprinted; newer: Fingerprinted; score: number }[] = [];
  for (const a of older) {
    if (matchedOlder.has(a.pattern.index)) continue;
    for (const b of newer) {
      if (matchedNewer.has(b.pattern.index)) continue;
      const score = similarity(a, b);
      if (score >= MIN_PATTERN_SIMILARITY) candidates.push({ older: a, newer: b, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const taken: Pair[] = [];
  const usedOlder = new Set<number>();
  const usedNewer = new Set<number>();
  for (const candidate of candidates) {
    if (usedOlder.has(candidate.older.pattern.index)) continue;
    if (usedNewer.has(candidate.newer.pattern.index)) continue;
    usedOlder.add(candidate.older.pattern.index);
    usedNewer.add(candidate.newer.pattern.index);
    taken.push({ older: candidate.older, newer: candidate.newer, identical: false });
  }

  return taken;
}

/**
 * Only slots where at least one side holds something count
 *
 * Counting every slot would let two unrelated patterns in a 33 track song agree on the
 * 28 they both leave empty and score 0.85
 */
function similarity(a: Fingerprinted, b: Fingerprinted): number {
  let shared = 0;
  let considered = 0;

  for (const [slot, older] of a.tracks.entries()) {
    const newer = b.tracks[slot];
    if (newer === undefined) continue;
    if (older === NO_TRACK_CONTENT && newer === NO_TRACK_CONTENT) continue;
    considered += 1;
    if (older === newer) shared += 1;
  }

  return considered === 0 ? 0 : shared / considered;
}

function changedTracks(a: Fingerprinted, b: Fingerprinted): number[] {
  const changed: number[] = [];

  for (const [slot, older] of a.tracks.entries()) {
    if (b.tracks[slot] !== older) changed.push(slot);
  }

  return changed;
}

/** Newer order, with what the newer song no longer has appended */
function describe(
  older: Fingerprinted[],
  newer: Fingerprinted[],
  pairs: Pair[],
): readonly PatternMatch[] {
  const byNewer = new Map(pairs.map((pair) => [pair.newer.pattern.index, pair]));
  const matchedOlder = new Set(pairs.map((pair) => pair.older.pattern.index));

  const matches: PatternMatch[] = newer.map((item) => {
    const pair = byNewer.get(item.pattern.index);
    if (pair === undefined) return { kind: "added", to: ref(item.pattern) };
    if (pair.identical) {
      return { kind: "identical", from: ref(pair.older.pattern), to: ref(item.pattern) };
    }
    return {
      kind: "modified",
      from: ref(pair.older.pattern),
      to: ref(item.pattern),
      similarity: similarity(pair.older, item),
      numberOfLines: change(pair.older.pattern.numberOfLines, item.pattern.numberOfLines),
      changedTracks: changedTracks(pair.older, item),
    };
  });

  for (const item of older) {
    if (!matchedOlder.has(item.pattern.index)) {
      matches.push({ kind: "removed", from: ref(item.pattern) });
    }
  }

  return matches;
}

function ref(pattern: Pattern): PatternRef {
  return {
    index: pattern.index,
    ...(pattern.name !== undefined && { name: pattern.name }),
    numberOfLines: pattern.numberOfLines,
  };
}
