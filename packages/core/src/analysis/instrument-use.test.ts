import { describe, expect, it } from "vitest";
import type { Line, NoteColumn } from "../domain/line.js";
import { NOTE_OFF, pitch } from "../domain/note.js";
import type { Pattern } from "../domain/pattern.js";
import type { SequenceEntry } from "../domain/sequence.js";
import type { Song } from "../domain/song.js";
import { song, track } from "../test-helpers/build.js";
import { instrumentUse } from "./instrument-use.js";

function on(semitone: number, instrument: string): NoteColumn {
  return { note: pitch(semitone), instrument };
}

function bare(semitone: number): NoteColumn {
  return { note: pitch(semitone) };
}

function line(index: number, ...noteColumns: NoteColumn[]): Line {
  return { index, noteColumns, effectColumns: [] };
}

function pattern(index: number, lines: Line[], numberOfLines = 16): Pattern {
  return { index, numberOfLines, tracks: [{ trackIndex: 0, lines }] };
}

function order(patternIndices: readonly number[]): SequenceEntry[] {
  return patternIndices.map((patternIndex, position) => ({
    position,
    patternIndex,
    isSectionStart: false,
  }));
}

function songOf(patterns: readonly Pattern[], sequence: readonly SequenceEntry[]): Song {
  return { ...song([track(0, "Drums")], patterns), sequence };
}

describe("instrumentUse", () => {
  it("counts a track's notes by the instrument they name", () => {
    const use = instrumentUse(
      songOf(
        [pattern(0, [line(0, on(48, "00")), line(4, on(48, "01")), line(8, on(48, "00"))])],
        order([0]),
      ),
    );

    expect(use[0]?.instruments).toEqual([
      { instrument: 0, notes: 2 },
      { instrument: 1, notes: 1 },
    ]);
    expect(use[0]?.notes).toBe(3);
  });

  it("carries the column's last named instrument down", () => {
    const use = instrumentUse(
      songOf(
        [pattern(0, [line(0, on(48, "02")), line(4, bare(50)), line(8, bare(52))])],
        order([0]),
      ),
    );

    expect(use[0]?.instruments).toEqual([{ instrument: 2, notes: 3 }]);
    expect(use[0]?.unknown).toBe(0);
  });

  it("leaves a note with nothing to inherit uncounted", () => {
    const use = instrumentUse(
      songOf([pattern(0, [line(0, bare(48)), line(4, on(50, "03"))])], order([0])),
    );

    expect(use[0]?.instruments).toEqual([{ instrument: 3, notes: 1 }]);
    expect(use[0]?.unknown).toBe(1);
  });

  it("keeps note columns apart, since each carries its own instrument", () => {
    const use = instrumentUse(
      songOf(
        [pattern(0, [line(0, on(48, "00"), on(60, "05")), line(4, bare(48), bare(60))])],
        order([0]),
      ),
    );

    expect(use[0]?.instruments).toEqual([
      { instrument: 0, notes: 2 },
      { instrument: 5, notes: 2 },
    ]);
  });

  it("counts a pattern once for every position it plays at", () => {
    const use = instrumentUse(songOf([pattern(0, [line(0, on(48, "01"))])], order([0, 0, 0])));

    expect(use[0]?.instruments).toEqual([{ instrument: 1, notes: 3 }]);
  });

  it("reads the instrument number as hex, which is how the column spells it", () => {
    const use = instrumentUse(
      songOf([pattern(0, [line(0, on(48, "0A")), line(4, on(48, "FE"))])], order([0])),
    );

    expect(use[0]?.instruments.map((one) => one.instrument)).toEqual([10, 254]);
  });

  it("does not count a note off as playing anything", () => {
    const use = instrumentUse(
      songOf([pattern(0, [line(0, on(48, "00")), line(4, { note: NOTE_OFF })])], order([0])),
    );

    expect(use[0]?.notes).toBe(1);
  });
});
