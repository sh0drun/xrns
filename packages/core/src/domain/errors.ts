/**
 * Errors raised deliberately, as opposed to bugs. A caller reports these back to
 * whoever asked for the song, and lets anything else surface as a crash rather than
 * dressing a defect up as a user mistake.
 */
export abstract class RenoiseError extends Error {}

/** An archive that is not a readable .xrns. */
export class MalformedArchiveError extends RenoiseError {
  override readonly name = "MalformedArchiveError";
}

/** A document that is not a song this reader can make sense of. */
export class MalformedSongError extends RenoiseError {
  override readonly name = "MalformedSongError";
}

export class UnsupportedVersionError extends RenoiseError {
  override readonly name = "UnsupportedVersionError";

  constructor(
    readonly docVersion: number,
    supported: string,
  ) {
    super(`Song format version ${String(docVersion)} is not supported (expected ${supported})`);
  }
}

export class InvalidNoteError extends RenoiseError {
  override readonly name = "InvalidNoteError";

  constructor(readonly value: string) {
    super(`"${value}" is not a note; expected a pitch such as C-4 or D#3, or OFF`);
  }
}
