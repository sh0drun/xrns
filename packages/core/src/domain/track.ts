/**
 * A track in the song's track list.
 *
 * The list is flat. A group track does not contain the tracks it groups; it carries
 * a nesting level and membership is implied by that depth against document order,
 * the way an indented outline works. Indices are therefore plain positions, and the
 * pattern side of the document uses the same ones.
 */
export type TrackType = "sequencer" | "group" | "master" | "send";

/** Red, green and blue from 0 to 255, which is how the file spells a track's colour */
export type TrackColor = readonly [number, number, number];

export interface Track {
  readonly index: number;
  readonly type: TrackType;
  readonly name: string;
  /**
   * The colour Renoise paints this track, absent where the file gives none
   *
   * Every track in the demo library and the fixtures has one, across five document
   * versions, but it is the composer's own and worth showing rather than assuming
   */
  readonly color?: TrackColor;
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
