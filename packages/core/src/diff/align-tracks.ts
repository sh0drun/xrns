import type { Song } from "../domain/song.js";
import type { Track } from "../domain/track.js";
import { NO_TRACK_CONTENT, fingerprintTrack } from "./fingerprint.js";

/** One slot in the shared track order, holding whichever side has a track there */
export interface AlignedTrack {
  readonly from: number | undefined;
  readonly to: number | undefined;
}

/** Tuned against guesswork until there are real pairs of songs to run it on */
const MIN_RENAME_SIMILARITY = 0.5;

/**
 * Matches tracks by type and name first, then tries the leftovers by content so a renamed
 * track keeps its history
 *
 * Content is a set of the track's fingerprints across every pattern rather than a list,
 * because pattern order is not shared between the two songs at this point
 */
export function alignTracks(from: Song, to: Song): readonly AlignedTrack[] {
  const matched = matchByName(from, to);
  rescueRenamed(from, to, matched);
  return inNewerOrder(from, to, matched);
}

function matchByName(from: Song, to: Song): Map<number, number> {
  const available = groupByName(to);
  const matched = new Map<number, number>();

  for (const track of from.tracks) {
    const candidate = available.get(nameKey(track))?.shift();
    if (candidate !== undefined) matched.set(track.index, candidate);
  }

  return matched;
}

function groupByName(song: Song): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  for (const track of song.tracks) {
    const key = nameKey(track);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [track.index]);
    else existing.push(track.index);
  }

  return groups;
}

function nameKey(track: Track): string {
  return `${track.type}\n${track.name}`;
}

function rescueRenamed(from: Song, to: Song, matched: Map<number, number>): void {
  const taken = new Set(matched.values());
  const fromLeft = leftovers(from, (track) => !matched.has(track.index));
  const toLeft = leftovers(to, (track) => !taken.has(track.index));

  const candidates: Pairing[] = [];
  for (const older of fromLeft) {
    for (const newer of toLeft) {
      if (older.track.type !== newer.track.type) continue;
      const score = similarity(older.content, newer.content);
      if (score >= MIN_RENAME_SIMILARITY) {
        candidates.push({ from: older.track.index, to: newer.track.index, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const used = new Set<number>();
  for (const candidate of candidates) {
    if (matched.has(candidate.from) || used.has(candidate.to)) continue;
    matched.set(candidate.from, candidate.to);
    used.add(candidate.to);
  }
}

interface Pairing {
  readonly from: number;
  readonly to: number;
  readonly score: number;
}

interface TrackContent {
  readonly track: Track;
  readonly content: ReadonlySet<string>;
}

function leftovers(song: Song, keep: (track: Track) => boolean): TrackContent[] {
  return song.tracks
    .filter(keep)
    .map((track) => ({ track, content: contentOf(song, track.index) }));
}

function contentOf(song: Song, trackIndex: number): ReadonlySet<string> {
  const prints = new Set<string>();

  for (const pattern of song.patterns) {
    const track = pattern.tracks[trackIndex];
    if (track === undefined) continue;
    const print = fingerprintTrack(track, pattern.numberOfLines);
    if (print !== NO_TRACK_CONTENT) prints.add(print);
  }

  return prints;
}

/** Empty on either side means there is no evidence, which is not the same as no match */
function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const print of a) if (b.has(print)) shared += 1;

  return shared / (a.size + b.size - shared);
}

/** Removed tracks go last, since they have no position in the order the newer song shows */
function inNewerOrder(from: Song, to: Song, matched: Map<number, number>): AlignedTrack[] {
  const olderOf = new Map([...matched].map(([older, newer]) => [newer, older]));

  const aligned: AlignedTrack[] = to.tracks.map((track) => ({
    from: olderOf.get(track.index),
    to: track.index,
  }));

  for (const track of from.tracks) {
    if (!matched.has(track.index)) aligned.push({ from: track.index, to: undefined });
  }

  return aligned;
}
