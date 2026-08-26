import { describe, expect, it } from "vitest";
import { pattern, song, track } from "../test-helpers/build.js";
import { alignTracks } from "./align-tracks.js";
import { matchPatterns } from "./match-patterns.js";
import type { PatternMatch } from "./song-diff.js";

function match(
  from: ReturnType<typeof song>,
  to: ReturnType<typeof song>,
): readonly PatternMatch[] {
  return matchPatterns(from, to, alignTracks(from, to));
}

const ONE_TRACK = [track(0, "Drums")];
const TWO_TRACKS = [track(0, "Drums"), track(1, "Bass")];

describe("matchPatterns", () => {
  it("pairs a pattern that did not change", () => {
    const older = song(ONE_TRACK, [pattern(0, [48])]);
    const newer = song(ONE_TRACK, [pattern(0, [48])]);
    expect(match(older, newer).map((m) => m.kind)).toEqual(["identical"]);
  });

  it("leaves the patterns around an inserted one alone", () => {
    const older = song(ONE_TRACK, [pattern(0, [48]), pattern(1, [50]), pattern(2, [52])]);
    const newer = song(ONE_TRACK, [
      pattern(0, [48]),
      pattern(1, [55]),
      pattern(2, [50]),
      pattern(3, [52]),
    ]);
    expect(match(older, newer).map((m) => m.kind)).toEqual([
      "identical",
      "added",
      "identical",
      "identical",
    ]);
  });

  it("names the track that changed", () => {
    const older = song(TWO_TRACKS, [pattern(0, [48, 50])]);
    const newer = song(TWO_TRACKS, [pattern(0, [48, 55])]);

    const [result] = match(older, newer);
    expect(result?.kind).toBe("modified");
    if (result?.kind !== "modified") return;
    expect(result.changedTracks).toEqual([1]);
    expect(result.similarity).toBe(0.5);
  });

  it("sees a shortened pattern as the same pattern", () => {
    const older = song(ONE_TRACK, [pattern(0, [48], 64)]);
    const newer = song(ONE_TRACK, [pattern(0, [48], 32)]);

    const [result] = match(older, newer);
    expect(result?.kind).toBe("modified");
    if (result?.kind !== "modified") return;
    expect(result.changedTracks).toEqual([]);
    expect(result.numberOfLines).toEqual({ kind: "changed", from: 64, to: 32 });
  });

  it("does not pair unrelated patterns on the tracks they both leave empty", () => {
    const tracks = [track(0, "Drums"), track(1, "A"), track(2, "B"), track(3, "C")];
    const older = song(tracks, [pattern(0, [48, undefined, undefined, undefined])]);
    const newer = song(tracks, [pattern(0, [55, undefined, undefined, undefined])]);
    expect(match(older, newer).map((m) => m.kind)).toEqual(["added", "removed"]);
  });

  it("reports a pattern the newer song no longer has", () => {
    const older = song(ONE_TRACK, [pattern(0, [48]), pattern(1, [50])]);
    const newer = song(ONE_TRACK, [pattern(0, [48])]);
    expect(match(older, newer).map((m) => m.kind)).toEqual(["identical", "removed"]);
  });
});
