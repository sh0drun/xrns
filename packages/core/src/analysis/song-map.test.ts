import { describe, expect, it } from "vitest";
import type { Line, NoteColumn } from "../domain/line.js";
import { pitch } from "../domain/note.js";
import type { Pattern } from "../domain/pattern.js";
import type { SequenceEntry } from "../domain/sequence.js";
import type { Song } from "../domain/song.js";
import { song, track } from "../test-helpers/build.js";
import { songMap } from "./song-map.js";

const NOTE: NoteColumn = { note: pitch(48) };

function lines(count: number): Line[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    noteColumns: [NOTE],
    effectColumns: [],
  }));
}

/** One pattern where each track holds the given number of lines */
function busy(index: number, perTrack: readonly number[]): Pattern {
  return {
    index,
    numberOfLines: 16,
    tracks: perTrack.map((count, trackIndex) => ({ trackIndex, lines: lines(count) })),
  };
}

function order(patternIndices: readonly number[]): SequenceEntry[] {
  return patternIndices.map((patternIndex, position) => ({
    position,
    patternIndex,
    isSectionStart: false,
  }));
}

function marked(entries: SequenceEntry[], at: number, name: string): SequenceEntry[] {
  return entries.map((entry) =>
    entry.position === at ? { ...entry, isSectionStart: true, sectionName: name } : entry,
  );
}

function songOf(patterns: readonly Pattern[], sequence: readonly SequenceEntry[]): Song {
  return { ...song([track(0, "Drums"), track(1, "Bass")], patterns), sequence };
}

describe("songMap", () => {
  it("gives a row per track and a cell per sequence position", () => {
    const map = songMap(songOf([busy(0, [4, 2])], order([0, 0, 0])));
    expect(map.rows).toHaveLength(2);
    expect(map.rows[0]?.cells).toHaveLength(3);
  });

  it("says which pattern plays at each position", () => {
    const map = songMap(songOf([busy(0, [4, 2]), busy(1, [1, 1])], order([0, 1, 0])));
    expect(map.positions).toEqual([0, 1, 0]);
  });

  it("carries how long each position lasts", () => {
    const map = songMap(songOf([busy(0, [1, 1]), busy(1, [1, 1])], order([0, 1])));
    expect(map.lengths).toEqual([16, 16]);
  });

  it("turns line counts into seconds at the song's tempo", () => {
    const map = songMap(songOf([busy(0, [1, 1])], order([0])));
    // 16 lines at 120 bpm and 4 lines per beat is four beats, which is two seconds
    expect(map.durations).toEqual([2]);
  });

  it("runs the first section from the start even when only a later one is marked", () => {
    const sequence = marked(order([0, 0, 0, 0]), 2, "drop");
    const map = songMap(songOf([busy(0, [1, 1])], sequence));
    expect(map.sections).toEqual([
      { name: undefined, start: 0, length: 2 },
      { name: "drop", start: 2, length: 2 },
    ]);
  });

  it("scales each track against its own busiest position", () => {
    const map = songMap(songOf([busy(0, [8, 1]), busy(1, [4, 1])], order([0, 1])));
    expect(map.rows[0]?.cells).toEqual([1, 0.5]);
    expect(map.rows[1]?.cells).toEqual([1, 1]);
  });

  it("reads a silent track as silent rather than as a division by zero", () => {
    const map = songMap(songOf([busy(0, [4, 0])], order([0])));
    expect(map.rows[1]?.cells).toEqual([0]);
  });

  it("follows the same pattern twice in the order", () => {
    const map = songMap(songOf([busy(0, [4, 0]), busy(1, [0, 0])], order([0, 1, 0])));
    expect(map.rows[0]?.cells).toEqual([1, 0, 1]);
  });

  it("counts an aliased track from the pattern it plays", () => {
    const source = busy(0, [6, 0]);
    const alias: Pattern = {
      index: 1,
      numberOfLines: 16,
      tracks: [
        { trackIndex: 0, aliasPatternIndex: 0, lines: [] },
        { trackIndex: 1, lines: [] },
      ],
    };
    const map = songMap(songOf([source, alias], order([0, 1])));
    expect(map.rows[0]?.cells).toEqual([1, 1]);
  });
});
