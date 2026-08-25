/**
 * A track in the song's track list.
 *
 * The list is flat. A group track does not contain the tracks it groups; it carries
 * a nesting level and membership is implied by that depth against document order,
 * the way an indented outline works. Indices are therefore plain positions, and the
 * pattern side of the document uses the same ones.
 */
export type TrackType = "sequencer" | "group" | "master" | "send";

export interface Track {
  readonly index: number;
  readonly type: TrackType;
  readonly name: string;
  /**
   * Renoise only displays and plays columns below these counts. Writing above them
   * produces data the composer cannot see, which is worse than refusing.
   */
  readonly visibleNoteColumns: number;
  readonly visibleEffectColumns: number;
  readonly groupNestingLevel: number;
}

/** Only sequencer tracks carry notes; group, master and send tracks have effects alone. */
export function acceptsNotes(track: Track): boolean {
  return track.type === "sequencer";
}
