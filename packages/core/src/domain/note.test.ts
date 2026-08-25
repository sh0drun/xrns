import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvalidNoteError } from "./errors.js";
import {
  HIGHEST_SEMITONE,
  LOWEST_SEMITONE,
  NOTE_OFF,
  formatNote,
  octaveOf,
  parseNote,
  pitch,
  pitchClassOf,
  pitchOf,
} from "./note.js";

const semitone = fc.integer({ min: LOWEST_SEMITONE, max: HIGHEST_SEMITONE });

describe("note", () => {
  it("survives a format and parse cycle at every pitch", () => {
    fc.assert(
      fc.property(semitone, (value) => {
        expect(parseNote(formatNote(pitch(value)))).toEqual(pitch(value));
      }),
    );
  });

  it("formats every pitch to the three characters the format uses", () => {
    fc.assert(
      fc.property(semitone, (value) => {
        expect(formatNote(pitch(value))).toMatch(/^[A-G][-#][0-9]$/);
      }),
    );
  });

  it("agrees with the pitches read off a tracker", () => {
    expect(parseNote("C-0")).toEqual(pitch(0));
    expect(parseNote("C-4")).toEqual(pitch(48));
    expect(parseNote("D#3")).toEqual(pitch(39));
    expect(parseNote("B-9")).toEqual(pitch(HIGHEST_SEMITONE));
    expect(formatNote(pitchOf(3, 4))).toBe("D#4");
    expect(formatNote(pitchOf(0, 0))).toBe("C-0");
  });

  it("round-trips note off, which is not a pitch", () => {
    expect(parseNote("OFF")).toEqual(NOTE_OFF);
    expect(formatNote(NOTE_OFF)).toBe("OFF");
    expect(octaveOf(NOTE_OFF)).toBeUndefined();
    expect(pitchClassOf(NOTE_OFF)).toBeUndefined();
  });

  it("splits a pitch into the octave and pitch class the tracker shows", () => {
    expect(octaveOf(parseNote("A#5"))).toBe(5);
    expect(pitchClassOf(parseNote("A#5"))).toBe(10);
  });

  // Renoise spells accidentals as sharps only, and never these two. Mapping them onto
  // F and C instead would write back a note the composer did not put there.
  it.each(["E#4", "B#2", "Cb4", "H-4", "C4", "C-", "c-4", "off", "", "C-10"])(
    "rejects %o rather than guessing at it",
    (value) => {
      expect(() => parseNote(value)).toThrow(InvalidNoteError);
    },
  );

  it("rejects pitches outside the range the format can spell", () => {
    expect(() => pitch(-1)).toThrow(InvalidNoteError);
    expect(() => pitch(HIGHEST_SEMITONE + 1)).toThrow(InvalidNoteError);
    expect(() => pitch(1.5)).toThrow(InvalidNoteError);
  });
});
