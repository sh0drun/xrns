import { readSongXml, readXrns } from "@xrns/core/xrns/archive.js";
import { RenoiseError } from "@xrns/core/domain/errors.js";
import { readSong } from "@xrns/core/xrns/reader.js";
import { parseSongXml } from "@xrns/core/xrns/song-document.js";
import type { Song } from "@xrns/core/domain/song.js";

export interface ParseRequest {
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

export type ParseResult =
  | { readonly kind: "song"; readonly name: string; readonly song: Song }
  | { readonly kind: "failed"; readonly name: string; readonly message: string };

/** Only the part of the worker scope this file uses, so the DOM lib and webworker lib never meet */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage(message: ParseResult): void;
}

const scope = self as unknown as WorkerScope;

/**
 * The document tree costs 194 MB on the largest demo song against 4 MB for the Song it
 * produces, so it is dropped here and never crosses back to the page
 */
scope.onmessage = (event) => {
  const { name, bytes } = event.data;

  try {
    const song = readSong(parseSongXml(readSongXml(readXrns(new Uint8Array(bytes)))));
    scope.postMessage({ kind: "song", name, song });
  } catch (error) {
    const message = error instanceof RenoiseError ? error.message : "could not be read";
    scope.postMessage({ kind: "failed", name, message });
  }
};
