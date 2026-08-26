import type { Song } from "../domain/song.js";
import { alignSequence } from "./align-sequence.js";
import { alignTracks } from "./align-tracks.js";
import type { AlignedTrack } from "./align-tracks.js";
import { matchPatterns } from "./match-patterns.js";
import { change } from "./song-diff.js";
import type { MetaDiff, SongDiff, TrackChange } from "./song-diff.js";

/**
 * Tracks are aligned first because both the pattern matcher and the track list are
 * written against that shared order
 */
export function diffSongs(from: Song, to: Song): SongDiff {
  const alignment = alignTracks(from, to);

  return {
    meta: meta(from, to),
    tracks: tracks(from, to, alignment),
    sequence: alignSequence(from.sequence, to.sequence),
    patterns: matchPatterns(from, to, alignment),
  };
}

function meta(from: Song, to: Song): MetaDiff {
  return {
    docVersion: change(from.docVersion, to.docVersion),
    name: change(from.name, to.name),
    artist: change(from.artist, to.artist),
    beatsPerMinute: change(from.beatsPerMinute, to.beatsPerMinute),
    linesPerBeat: change(from.linesPerBeat, to.linesPerBeat),
    ticksPerLine: change(from.ticksPerLine, to.ticksPerLine),
  };
}

function tracks(from: Song, to: Song, alignment: readonly AlignedTrack[]): TrackChange[] {
  return alignment.map((slot) => {
    const older = slot.from === undefined ? undefined : from.tracks[slot.from];
    const newer = slot.to === undefined ? undefined : to.tracks[slot.to];

    if (older === undefined && newer !== undefined) return { kind: "added", track: newer };
    if (newer === undefined && older !== undefined) return { kind: "removed", track: older };
    if (older === undefined || newer === undefined) {
      throw new Error("an aligned slot held neither an older nor a newer track");
    }

    return {
      kind: "kept",
      type: newer.type,
      index: change(older.index, newer.index),
      name: change(older.name, newer.name),
      visibleNoteColumns: change(older.visibleNoteColumns, newer.visibleNoteColumns),
      visibleEffectColumns: change(older.visibleEffectColumns, newer.visibleEffectColumns),
    };
  });
}
