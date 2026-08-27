import { describe, expect, it } from "vitest";
import type { Line, NoteColumn } from "../domain/line.js";
import { pitch } from "../domain/note.js";
import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { AlignedTrack } from "./align-tracks.js";
import { diffPattern } from "./diff-pattern.js";

const ONE_SLOT: readonly AlignedTrack[] = [{ from: 0, to: 0 }];

function line(index: number, ...noteColumns: NoteColumn[]): Line {
  return { index, noteColumns, effectColumns: [] };
}

function patternOf(lines: readonly Line[], numberOfLines = 16): Pattern {
  const track: PatternTrack = { trackIndex: 0, lines };
  return { index: 0, numberOfLines, tracks: [track] };
}

describe("diffPattern", () => {
  it("says nothing about a pattern that did not change", () => {
    const same = patternOf([line(0, { note: pitch(48) })]);
    expect(diffPattern(same, same, ONE_SLOT).tracks).toEqual([]);
  });

  it("names the field that moved rather than the whole cell", () => {
    const before = patternOf([line(0, { note: pitch(48), volume: "40" })]);
    const after = patternOf([line(0, { note: pitch(48), volume: "60" })]);

    const [track] = diffPattern(before, after, ONE_SLOT).tracks;
    const [change] = track?.notes ?? [];
    expect(change?.kind).toBe("changed");
    if (change?.kind !== "changed") return;
    expect(change.fields).toEqual(["volume"]);
    expect(change.line).toBe(0);
    expect(change.column).toBe(0);
  });

  it("reports a note that was not there before", () => {
    const before = patternOf([]);
    const after = patternOf([line(4, { note: pitch(50) })]);

    const [track] = diffPattern(before, after, ONE_SLOT).tracks;
    expect(track?.notes.map((change) => change.kind)).toEqual(["added"]);
  });

  it("reports a note that is gone", () => {
    const before = patternOf([line(4, { note: pitch(50) })]);
    const after = patternOf([]);

    const [track] = diffPattern(before, after, ONE_SLOT).tracks;
    expect(track?.notes.map((change) => change.kind)).toEqual(["removed"]);
  });

  it("treats an empty column as no note at all", () => {
    const before = patternOf([line(0, { note: pitch(48) }, {})]);
    const after = patternOf([line(0, { note: pitch(48) })]);
    expect(diffPattern(before, after, ONE_SLOT).tracks).toEqual([]);
  });

  it("ignores content past the shortened pattern's end", () => {
    const before = patternOf([line(0, { note: pitch(48) }), line(20, { note: pitch(50) })], 16);
    const after = patternOf([line(0, { note: pitch(48) })], 16);
    expect(diffPattern(before, after, ONE_SLOT).tracks).toEqual([]);
  });

  it("reports an alias that now points somewhere else", () => {
    const before: Pattern = {
      index: 0,
      numberOfLines: 16,
      tracks: [{ trackIndex: 0, aliasPatternIndex: 3, lines: [] }],
    };
    const after: Pattern = {
      index: 0,
      numberOfLines: 16,
      tracks: [{ trackIndex: 0, aliasPatternIndex: 8, lines: [] }],
    };

    const [track] = diffPattern(before, after, ONE_SLOT).tracks;
    expect(track?.aliasing).toEqual({ kind: "changed", from: 3, to: 8 });
    expect(track?.notes).toEqual([]);
  });

  it("does not compare the contents of a track that aliases the same pattern", () => {
    const alias: Pattern = {
      index: 0,
      numberOfLines: 16,
      tracks: [{ trackIndex: 0, aliasPatternIndex: 3, lines: [line(0, { note: pitch(48) })] }],
    };
    expect(diffPattern(alias, alias, ONE_SLOT).tracks).toEqual([]);
  });

  it("leaves out a track that has no content on either side", () => {
    const before = patternOf([line(0, { note: pitch(48) })]);
    const after = patternOf([line(0, { note: pitch(48) })]);
    const twoSlots: readonly AlignedTrack[] = [
      { from: 0, to: 0 },
      { from: 1, to: 1 },
    ];
    expect(diffPattern(before, after, twoSlots).tracks).toEqual([]);
  });
});
