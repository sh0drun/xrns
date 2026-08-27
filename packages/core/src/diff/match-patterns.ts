import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";
import type { AlignedTrack } from "./align-tracks.js";
import { NO_TRACK_CONTENT, fingerprintPattern, fingerprintTrack, lineKeys } from "./fingerprint.js";
import { change } from "./song-diff.js";
import type { PatternMatch, PatternRef } from "./song-diff.js";

/** A share of the lines, not of the tracks, so half the pattern has to survive */
const MIN_PATTERN_SIMILARITY = 0.5;

interface Fingerprinted {
  readonly pattern: Pattern;
  /** One entry per aligned slot, so the two songs can be compared position by position */
  readonly tracks: readonly string[];
  /** The same slots, resolved, so line keys can be built for the ones that need scoring */
  readonly resolved: readonly (PatternTrack | undefined)[];
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
  const resolved = alignment.map((slot) => {
    const index = side(slot);
    return index === undefined ? undefined : pattern.tracks[index];
  });

  const tracks = resolved.map((track) =>
    track === undefined ? NO_TRACK_CONTENT : fingerprintTrack(track, pattern.numberOfLines),
  );

  return { pattern, tracks, resolved, whole: fingerprintPattern(pattern.numberOfLines, tracks) };
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

  const olderLeft = older.filter((item) => !matchedOlder.has(item.pattern.index));
  const newerLeft = newer.filter((item) => !matchedNewer.has(item.pattern.index));

  // Line keys cost more than track fingerprints, so only the leftovers pay for them
  const keys = new Map<Fingerprinted, LineKeys[]>();
  for (const item of [...olderLeft, ...newerLeft]) keys.set(item, keysOf(item));

  const candidates: Pairing[] = [];
  for (const a of olderLeft) {
    for (const b of newerLeft) {
      const score = similarity(keys.get(a) ?? [], keys.get(b) ?? []);
      if (score >= MIN_PATTERN_SIMILARITY) {
        candidates.push({ from: a.pattern.index, to: b.pattern.index, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const byIndex = new Map<number, Fingerprinted>();
  for (const item of olderLeft) byIndex.set(item.pattern.index, item);

  const taken: Pair[] = [];
  const usedOlder = new Set<number>();
  const usedNewer = new Set<number>();
  for (const candidate of candidates) {
    if (usedOlder.has(candidate.from) || usedNewer.has(candidate.to)) continue;
    const a = byIndex.get(candidate.from);
    const b = newerLeft.find((item) => item.pattern.index === candidate.to);
    if (a === undefined || b === undefined) continue;
    usedOlder.add(candidate.from);
    usedNewer.add(candidate.to);
    taken.push({ older: a, newer: b, identical: false });
  }

  return taken;
}

interface Pairing {
  readonly from: number;
  readonly to: number;
  readonly score: number;
}

type LineKeys = ReadonlyMap<number, string>;

function keysOf(item: Fingerprinted): LineKeys[] {
  return item.resolved.map((track) =>
    track === undefined ? new Map<number, string>() : lineKeys(track, item.pattern.numberOfLines),
  );
}

/**
 * How much of the two patterns is the same line for line
 *
 * Comparing whole tracks instead would call a sparse pattern unrelated after two edits,
 * since a track counts as different the moment one cell in it moves
 */
function similarity(a: readonly LineKeys[], b: readonly LineKeys[]): number {
  let shared = 0;
  let considered = 0;

  for (const [slot, older] of a.entries()) {
    const newer = b[slot] ?? new Map<number, string>();
    const indices = new Set([...older.keys(), ...newer.keys()]);
    for (const index of indices) {
      considered += 1;
      if (older.get(index) === newer.get(index)) shared += 1;
    }
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
      similarity: similarity(keysOf(pair.older), keysOf(item)),
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
