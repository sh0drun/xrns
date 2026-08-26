import { describe, expect, it } from "vitest";
import { pitch } from "../domain/note.js";
import type { Pattern } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";
import type { Track, TrackType } from "../domain/track.js";
import { alignTracks } from "./align-tracks.js";

function track(index: number, name: string, type: TrackType = "sequencer"): Track {
  return {
    index,
    type,
    name,
    visibleNoteColumns: 1,
    visibleEffectColumns: 0,
    groupNestingLevel: 0,
  };
}

/** One line at index 0 per track, or nothing at all where the semitone is undefined */
function pattern(index: number, semitones: readonly (number | undefined)[]): Pattern {
  return {
    index,
    numberOfLines: 4,
    tracks: semitones.map((semitone, trackIndex) => ({
      trackIndex,
      lines:
        semitone === undefined
          ? []
          : [{ index: 0, noteColumns: [{ note: pitch(semitone) }], effectColumns: [] }],
    })),
  };
}

function song(tracks: readonly Track[], patterns: readonly Pattern[] = []): Song {
  return {
    docVersion: 67,
    name: "",
    artist: "",
    beatsPerMinute: 120,
    linesPerBeat: 4,
    ticksPerLine: 12,
    tracks,
    patterns,
    sequence: [],
  };
}

describe("alignTracks", () => {
  it("matches a track by type and name", () => {
    const aligned = alignTracks(song([track(0, "Drums")]), song([track(0, "Drums")]));
    expect(aligned).toEqual([{ from: 0, to: 0 }]);
  });

  it("pairs same-named tracks in the order they appear", () => {
    const three = [track(0, "Drums"), track(1, "Drums"), track(2, "Drums")];
    expect(alignTracks(song(three), song(three))).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 1 },
      { from: 2, to: 2 },
    ]);
  });

  it("matches a renamed track by its content", () => {
    const older = song([track(0, "Drums")], [pattern(0, [48])]);
    const newer = song([track(0, "Percussion")], [pattern(0, [48])]);
    expect(alignTracks(older, newer)).toEqual([{ from: 0, to: 0 }]);
  });

  it("leaves a renamed track with no content unmatched", () => {
    const older = song([track(0, "Drums")], [pattern(0, [undefined])]);
    const newer = song([track(0, "Percussion")], [pattern(0, [undefined])]);
    expect(alignTracks(older, newer)).toEqual([
      { from: undefined, to: 0 },
      { from: 0, to: undefined },
    ]);
  });

  it("never pairs tracks of different types", () => {
    const older = song([track(0, "Bus", "send")], [pattern(0, [48])]);
    const newer = song([track(0, "Group", "group")], [pattern(0, [48])]);
    expect(alignTracks(older, newer)).toEqual([
      { from: undefined, to: 0 },
      { from: 0, to: undefined },
    ]);
  });

  it("reports a track only in the newer song as an addition", () => {
    const aligned = alignTracks(song([]), song([track(0, "Lead")]));
    expect(aligned).toEqual([{ from: undefined, to: 0 }]);
  });
});
