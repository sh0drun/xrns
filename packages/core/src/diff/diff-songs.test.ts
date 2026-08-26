import { describe, expect, it } from "vitest";
import { pattern, song, track } from "../test-helpers/build.js";
import { diffSongs } from "./diff-songs.js";

describe("diffSongs", () => {
  it("reports a tempo change and leaves the rest alone", () => {
    const older = song([track(0, "Drums")]);
    const newer = { ...song([track(0, "Drums")]), beatsPerMinute: 174 };

    const diff = diffSongs(older, newer);
    expect(diff.meta.beatsPerMinute).toEqual({ kind: "changed", from: 120, to: 174 });
    expect(diff.meta.linesPerBeat).toEqual({ kind: "same", value: 4 });
  });

  it("reports a renamed track as the same track under a new name", () => {
    const older = song([track(0, "Drums")], [pattern(0, [48])]);
    const newer = song([track(0, "Percussion")], [pattern(0, [48])]);

    const [change] = diffSongs(older, newer).tracks;
    expect(change?.kind).toBe("kept");
    if (change?.kind !== "kept") return;
    expect(change.name).toEqual({ kind: "changed", from: "Drums", to: "Percussion" });
    expect(change.index).toEqual({ kind: "same", value: 0 });
  });

  it("reports a track the older song did not have", () => {
    const older = song([track(0, "Drums")]);
    const newer = song([track(0, "Drums"), track(1, "Lead")]);

    expect(diffSongs(older, newer).tracks.map((change) => change.kind)).toEqual(["kept", "added"]);
  });

  it("holds the sequence and the pattern pool apart", () => {
    const tracks = [track(0, "Drums")];
    const older = { ...song(tracks, [pattern(0, [48]), pattern(1, [50])]) };
    const newer = { ...song(tracks, [pattern(0, [48]), pattern(1, [50])]) };

    const diff = diffSongs(older, newer);
    expect(diff.patterns.map((match) => match.kind)).toEqual(["identical", "identical"]);
    expect(diff.sequence).toEqual([]);
  });
});
