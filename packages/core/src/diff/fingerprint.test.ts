import { describe, expect, it } from "vitest";
import type { Line, NoteColumn } from "../domain/line.js";
import { pitch } from "../domain/note.js";
import type { PatternTrack } from "../domain/pattern.js";
import { fingerprintPattern, fingerprintTrack } from "./fingerprint.js";

const EMPTY: NoteColumn = {};

function noteColumn(semitone: number, rest?: Omit<NoteColumn, "note">): NoteColumn {
  return { note: pitch(semitone), ...rest };
}

function line(index: number, ...noteColumns: NoteColumn[]): Line {
  return { index, noteColumns, effectColumns: [] };
}

function track(...lines: Line[]): PatternTrack {
  return { trackIndex: 0, lines };
}

describe("fingerprintTrack", () => {
  it("ignores a trailing empty note column", () => {
    expect(fingerprintTrack(track(line(0, noteColumn(48), EMPTY)), 4)).toBe(
      fingerprintTrack(track(line(0, noteColumn(48))), 4),
    );
  });

  it("keeps an empty column sitting between two used ones", () => {
    expect(fingerprintTrack(track(line(0, noteColumn(48), EMPTY, noteColumn(50))), 4)).not.toBe(
      fingerprintTrack(track(line(0, noteColumn(48), noteColumn(50))), 4),
    );
  });

  it("ignores content past the pattern's end", () => {
    const past = track(line(0, noteColumn(48)), line(8, noteColumn(50)));
    expect(fingerprintTrack(past, 4)).toBe(fingerprintTrack(track(line(0, noteColumn(48))), 4));
  });

  it("ignores an empty line", () => {
    const withEmpty = track(line(0, noteColumn(48)), line(2, EMPTY));
    expect(fingerprintTrack(withEmpty, 4)).toBe(
      fingerprintTrack(track(line(0, noteColumn(48))), 4),
    );
  });

  it("separates the same note on a different line", () => {
    expect(fingerprintTrack(track(line(0, noteColumn(48))), 4)).not.toBe(
      fingerprintTrack(track(line(2, noteColumn(48))), 4),
    );
  });

  it("separates a note whose volume changed", () => {
    expect(fingerprintTrack(track(line(0, noteColumn(48, { volume: "40" }))), 4)).not.toBe(
      fingerprintTrack(track(line(0, noteColumn(48, { volume: "60" }))), 4),
    );
  });

  it("identifies an aliased track by its target", () => {
    const toSeven: PatternTrack = { trackIndex: 0, aliasPatternIndex: 7, lines: [] };
    const toEight: PatternTrack = { trackIndex: 0, aliasPatternIndex: 8, lines: [] };
    expect(fingerprintTrack(toSeven, 64)).not.toBe(fingerprintTrack(toEight, 64));
  });

  it("separates an alias from a track holding its own content", () => {
    const alias: PatternTrack = { trackIndex: 0, aliasPatternIndex: 7, lines: [] };
    expect(fingerprintTrack(alias, 64)).not.toBe(fingerprintTrack(track(), 64));
  });
});

describe("fingerprintPattern", () => {
  it("separates a pattern that was shortened", () => {
    const tracks = ["one", "two"];
    expect(fingerprintPattern(64, tracks)).not.toBe(fingerprintPattern(32, tracks));
  });
});
