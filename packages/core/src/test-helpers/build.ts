import { pitch } from "../domain/note.js";
import type { Pattern } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";
import type { Track, TrackType } from "../domain/track.js";

export function track(index: number, name: string, type: TrackType = "sequencer"): Track {
  return {
    index,
    type,
    name,
    visibleNoteColumns: 1,
    visibleEffectColumns: 0,
    groupNestingLevel: 0,
  };
}

/** One note at line 0 per track, or an empty track where the semitone is undefined */
export function pattern(
  index: number,
  semitones: readonly (number | undefined)[],
  numberOfLines = 4,
): Pattern {
  return {
    index,
    numberOfLines,
    tracks: semitones.map((semitone, trackIndex) => ({
      trackIndex,
      lines:
        semitone === undefined
          ? []
          : [{ index: 0, noteColumns: [{ note: pitch(semitone) }], effectColumns: [] }],
    })),
  };
}

export function song(tracks: readonly Track[], patterns: readonly Pattern[] = []): Song {
  return {
    docVersion: 67,
    name: "",
    artist: "",
    beatsPerMinute: 120,
    linesPerBeat: 4,
    ticksPerLine: 12,
    tracks,
    instruments: [],
    patterns,
    sequence: [],
  };
}
