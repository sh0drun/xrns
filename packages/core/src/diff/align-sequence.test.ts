import { describe, expect, it } from "vitest";
import type { SequenceEntry } from "../domain/sequence.js";
import { alignSequence } from "./align-sequence.js";

function order(patternIndices: readonly number[]): SequenceEntry[] {
  return patternIndices.map((patternIndex, position) => ({
    position,
    patternIndex,
    isSectionStart: false,
  }));
}

function kinds(from: readonly number[], to: readonly number[]): string[] {
  return alignSequence(order(from), order(to)).map((change) => change.kind);
}

describe("alignSequence", () => {
  it("keeps every position when nothing moved", () => {
    expect(kinds([0, 1, 2], [0, 1, 2])).toEqual(["kept", "kept", "kept"]);
  });

  it("reports one insertion rather than shifting everything after it", () => {
    expect(kinds([0, 1, 2], [0, 9, 1, 2])).toEqual(["kept", "inserted", "kept", "kept"]);
  });

  it("reports a removed position", () => {
    expect(kinds([0, 1, 2], [0, 2])).toEqual(["kept", "removed", "kept"]);
  });

  it("matches a repeated pattern in the order it plays", () => {
    expect(kinds([4, 4, 4], [4, 4])).toEqual(["kept", "kept", "removed"]);
  });

  it("reads a moved position as a removal and an insertion", () => {
    expect(kinds([0, 1, 2], [1, 2, 0])).toEqual(["removed", "kept", "kept", "inserted"]);
  });

  it("carries both entries through a kept position", () => {
    const from = order([7]);
    const to = order([7]);
    expect(alignSequence(from, to)).toEqual([{ kind: "kept", from: from[0], to: to[0] }]);
  });
});
