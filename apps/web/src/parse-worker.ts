import { diffSongs } from "@xrns/core/diff/diff-songs.js";
import { RenoiseError } from "@xrns/core/domain/errors.js";
import { readSongXml, readXrns } from "@xrns/core/xrns/archive.js";
import { readSong } from "@xrns/core/xrns/reader.js";
import { parseSongXml } from "@xrns/core/xrns/song-document.js";
import type { SongDiff } from "@xrns/core/diff/song-diff.js";
import type { Song } from "@xrns/core/domain/song.js";

export type Slot = "before" | "after";

export interface ParseRequest {
  readonly slot: Slot;
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

export type WorkerMessage =
  | { readonly kind: "song"; readonly slot: Slot; readonly name: string; readonly song: Song }
  | { readonly kind: "diff"; readonly diff: SongDiff }
  | {
      readonly kind: "failed";
      readonly slot: Slot;
      readonly name: string;
      readonly message: string;
    };

/** Only the part of the worker scope this file uses, so the DOM lib and webworker lib never meet */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
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

scope.onmessage = (event) => {
  const { slot, name, bytes } = event.data;

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
  if (before !== undefined && after !== undefined) {
    scope.postMessage({ kind: "diff", diff: diffSongs(before, after) });
  }
};
