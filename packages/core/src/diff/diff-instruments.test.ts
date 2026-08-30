import { describe, expect, it } from "vitest";
import type { Instrument, Sample } from "../domain/instrument.js";
import type { Song } from "../domain/song.js";
import { song, track } from "../test-helpers/build.js";
import { diffInstruments } from "./diff-instruments.js";

function sample(name: string, overrides: Partial<Sample> = {}): Sample {
  return {
    index: 0,
    name,
    volume: 1,
    panning: 0.5,
    transpose: 0,
    finetune: 0,
    loopMode: "off",
    loopStart: 0,
    loopEnd: 0,
    mapping: { baseNote: 48, noteStart: 0, noteEnd: 119, velocityStart: 0, velocityEnd: 127 },
    ...overrides,
  };
}

function instrument(index: number, name: string, samples: Sample[] = []): Instrument {
  return { index, name, activeGenerator: "Samples", samples };
}

function songWith(instruments: Instrument[]): Song {
  return { ...song([track(0, "Drums")]), instruments };
}

const KICK = instrument(0, "Kick", [sample("Kick Body")]);

describe("diffInstruments", () => {
  it("says nothing about a slot that is blank in both songs", () => {
    const empty = songWith([instrument(0, ""), instrument(1, "")]);
    expect(diffInstruments(empty, empty)).toEqual([]);
  });

  it("reads a slot that gained an instrument as added", () => {
    const matches = diffInstruments(songWith([instrument(0, "")]), songWith([KICK]));

    expect(matches).toEqual([{ kind: "added", index: 0, instrument: KICK }]);
  });

  it("reads a slot that lost its instrument as removed", () => {
    const matches = diffInstruments(songWith([KICK]), songWith([instrument(0, "")]));

    expect(matches.map((match) => match.kind)).toEqual(["removed"]);
  });

  it("leaves an untouched instrument identical", () => {
    const same = songWith([KICK]);
    expect(diffInstruments(same, same)).toEqual([
      { kind: "identical", index: 0, instrument: KICK },
    ]);
  });

  it("carries an instrument rename with both names", () => {
    const matches = diffInstruments(
      songWith([KICK]),
      songWith([instrument(0, "Kick 2", [sample("Kick Body")])]),
    );

    expect(matches[0]).toMatchObject({
      kind: "modified",
      name: { kind: "changed", from: "Kick", to: "Kick 2" },
    });
  });

  it("names only the sample fields that moved", () => {
    const matches = diffInstruments(
      songWith([KICK]),
      songWith([instrument(0, "Kick", [sample("Kick Body", { loopEnd: 4100, transpose: 2 })])]),
    );

    const first = matches[0];
    expect(first?.kind).toBe("modified");
    expect(first?.kind === "modified" && first.samples[0]).toEqual({
      kind: "modified",
      index: 0,
      name: "Kick Body",
      fields: [
        { field: "transpose", from: 0, to: 2 },
        { field: "loopEnd", from: 0, to: 4100 },
      ],
    });
  });

  it("reads a sample added to an instrument", () => {
    const matches = diffInstruments(
      songWith([KICK]),
      songWith([instrument(0, "Kick", [sample("Kick Body"), sample("Kick Snap")])]),
    );

    const first = matches[0];
    expect(first?.kind === "modified" && first.samples.map((one) => one.kind)).toEqual([
      "identical",
      "added",
    ]);
  });

  it("reads a mapping change, since a sample can move across the keyboard", () => {
    const matches = diffInstruments(
      songWith([KICK]),
      songWith([
        instrument(0, "Kick", [
          sample("Kick Body", {
            mapping: {
              baseNote: 48,
              noteStart: 36,
              noteEnd: 60,
              velocityStart: 0,
              velocityEnd: 127,
            },
          }),
        ]),
      ]),
    );

    const first = matches[0];
    expect(first?.kind === "modified" && first.samples[0]).toMatchObject({
      fields: [
        { field: "noteStart", from: 0, to: 36 },
        { field: "noteEnd", from: 119, to: 60 },
      ],
    });
  });
});
