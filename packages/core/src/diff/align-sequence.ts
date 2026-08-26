import type { SequenceEntry } from "../domain/sequence.js";
import type { SequenceChange } from "./song-diff.js";

/**
 * The playback order is a list of pattern references, so the usual longest common
 * subsequence applies and inserting a section reads as an insertion rather than as
 * everything after it changing
 *
 * Positions are compared on which pattern plays there and nothing else, so a section
 * mark that moved comes back as kept with two entries the view can compare
 */
export function alignSequence(
  from: readonly SequenceEntry[],
  to: readonly SequenceEntry[],
): readonly SequenceChange[] {
  const lengths = commonLengths(from, to);
  const width = to.length + 1;
  const at = (i: number, j: number): number => lengths[i * width + j] ?? 0;

  const changes: SequenceChange[] = [];
  let i = 0;
  let j = 0;

  while (i < from.length && j < to.length) {
    const older = from[i];
    const newer = to[j];
    if (older === undefined || newer === undefined) break;

    if (older.patternIndex === newer.patternIndex) {
      changes.push({ kind: "kept", from: older, to: newer });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      changes.push({ kind: "removed", from: older });
      i += 1;
    } else {
      changes.push({ kind: "inserted", to: newer });
      j += 1;
    }
  }

  for (; i < from.length; i += 1) {
    const older = from[i];
    if (older !== undefined) changes.push({ kind: "removed", from: older });
  }

  for (; j < to.length; j += 1) {
    const newer = to[j];
    if (newer !== undefined) changes.push({ kind: "inserted", to: newer });
  }

  return changes;
}

/** lengths[i][j] is the longest common subsequence of the tails starting at i and j */
function commonLengths(from: readonly SequenceEntry[], to: readonly SequenceEntry[]): Uint32Array {
  const width = to.length + 1;
  const lengths = new Uint32Array((from.length + 1) * width);

  for (let i = from.length - 1; i >= 0; i -= 1) {
    for (let j = to.length - 1; j >= 0; j -= 1) {
      const same = from[i]?.patternIndex === to[j]?.patternIndex;
      const best = same
        ? (lengths[(i + 1) * width + (j + 1)] ?? 0) + 1
        : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + (j + 1)] ?? 0);
      lengths[i * width + j] = best;
    }
  }

  return lengths;
}
