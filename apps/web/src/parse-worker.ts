import { alignTracks } from "@xrns/core/diff/align-tracks.js";
import { diffPattern } from "@xrns/core/diff/diff-pattern.js";
import { diffSongs } from "@xrns/core/diff/diff-songs.js";
import { RenoiseError } from "@xrns/core/domain/errors.js";
import { readSongXml, readXrns } from "@xrns/core/xrns/archive.js";
import { readSong } from "@xrns/core/xrns/reader.js";
import { parseSongXml } from "@xrns/core/xrns/song-document.js";
import type { AlignedTrack } from "@xrns/core/diff/align-tracks.js";
import type { PatternDiff } from "@xrns/core/diff/diff-pattern.js";
import type { SongDiff } from "@xrns/core/diff/song-diff.js";
import type { Pattern } from "@xrns/core/domain/pattern.js";
import type { Song } from "@xrns/core/domain/song.js";

export type Slot = "before" | "after";

export interface ParseRequest {
  readonly kind: "parse";
  readonly slot: Slot;
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

/** Pattern indices, each in its own song's numbering */
export interface PatternRequest {
  readonly kind: "pattern";
  readonly from: number;
  readonly to: number;
}

export type WorkerRequest = ParseRequest | PatternRequest;

export type WorkerMessage =
  | { readonly kind: "song"; readonly slot: Slot; readonly name: string; readonly song: Song }
  | { readonly kind: "diff"; readonly diff: SongDiff }
  | {
      readonly kind: "pattern";
      readonly from: Pattern;
      readonly to: Pattern;
      readonly diff: PatternDiff;
      /** Carried so a slot in the diff resolves to a track in each pattern */
      readonly alignment: readonly AlignedTrack[];
      /** Both values, since the two songs can disagree about how long a beat is */
      readonly linesPerBeat: { readonly from: number; readonly to: number };
    }
  | {
      readonly kind: "failed";
      readonly slot: Slot;
      readonly name: string;
      readonly message: string;
    };

/** Only the part of the worker scope this file uses, so the DOM lib and webworker lib never meet */
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerMessage): void;
}

const scope = self as unknown as WorkerScope;

/**
 * The songs stay here rather than being sent back to be compared
 *
 * The document tree they came from does not: it costs 194 MB on the largest demo song
 * against 4 MB for the Song, and nothing downstream needs it
 */
const loaded = new Map<Slot, Song>();

/** Kept so opening a pattern uses the same alignment the song diff was built from */
let alignment: readonly AlignedTrack[] | undefined;

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === "parse") parse(request);
  else openPattern(request);
};

function parse(request: ParseRequest): void {
  const { slot, name, bytes } = request;

  let song: Song;
  try {
    song = readSong(parseSongXml(readSongXml(readXrns(new Uint8Array(bytes)))));
  } catch (error) {
    const message = error instanceof RenoiseError ? error.message : "could not be read";
    scope.postMessage({ kind: "failed", slot, name, message });
    return;
  }

  loaded.set(slot, song);
  scope.postMessage({ kind: "song", slot, name, song });

  const before = loaded.get("before");
  const after = loaded.get("after");
  if (before === undefined || after === undefined) return;

  alignment = alignTracks(before, after);
  scope.postMessage({ kind: "diff", diff: diffSongs(before, after, alignment) });
}

function openPattern(request: PatternRequest): void {
  const before = loaded.get("before");
  const after = loaded.get("after");
  if (before === undefined || after === undefined || alignment === undefined) return;

  const from = before.patterns[request.from];
  const to = after.patterns[request.to];
  if (from === undefined || to === undefined) return;

  const diff = diffPattern(from, to, alignment);
  const linesPerBeat = { from: before.linesPerBeat, to: after.linesPerBeat };
  scope.postMessage({ kind: "pattern", from, to, diff, alignment, linesPerBeat });
}
