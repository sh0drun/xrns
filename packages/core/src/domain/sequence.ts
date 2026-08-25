/**
 * The playback order: which pattern plays at each position, and where the composer
 * marked a new section. The same pattern may appear at many positions, so a position
 * is not interchangeable with a pattern index.
 */
export interface SequenceEntry {
  readonly position: number;
  readonly patternIndex: number;
  readonly isSectionStart: boolean;
  readonly sectionName?: string;
}

/** The section each position belongs to, carried forward from its most recent start. */
export function sectionAt(
  sequence: readonly SequenceEntry[],
  position: number,
): string | undefined {
  let section: string | undefined;
  for (const entry of sequence) {
    if (entry.position > position) break;
    if (entry.isSectionStart) section = entry.sectionName;
  }
  return section;
}
