import { instrumentUse } from "@xrns/core/analysis/instrument-use.js";
import { songMap } from "@xrns/core/analysis/song-map.js";
import { alignTracks } from "@xrns/core/diff/align-tracks.js";
import { diffPattern } from "@xrns/core/diff/diff-pattern.js";
import { diffSongs } from "@xrns/core/diff/diff-songs.js";
import { RenoiseError } from "@xrns/core/domain/errors.js";
import { readSongXml, readXrns } from "@xrns/core/xrns/archive.js";
import { readSong } from "@xrns/core/xrns/reader.js";
import { parseSongXml } from "@xrns/core/xrns/song-document.js";
import type { SongMap } from "@xrns/core/analysis/song-map.js";
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

/**
 * Pattern indices, each in its own song's numbering
 *
 * One side is absent for a pattern that only exists in one song, which is how an added
 * or a removed pattern is opened
 */
export interface PatternRequest {
  readonly kind: "pattern";
  readonly from?: number;
  readonly to?: number;
}

export type PatternSide = "both" | "added" | "removed";

export type WorkerRequest = ParseRequest | PatternRequest;

/**
 * One track and what it plays, already named
 *
 * Resolved here so the page never needs the instrument list to read a track's row
 */
export interface InstrumentRow {
  readonly track: string;
  /** The track's own colour from the file, already CSS, absent where the song gives none */
  readonly color?: string;
  readonly notes: number;
  readonly unknown: number;
  readonly instruments: readonly { readonly name: string; readonly notes: number }[];
}

export interface Instruments {
  readonly rows: readonly InstrumentRow[];
  /** Named instruments, for a song whose notes never say which one they play */
  readonly catalog: readonly string[];
}

export type WorkerMessage =
  | {
      readonly kind: "song";
      readonly slot: Slot;
      readonly name: string;
      readonly song: Song;
      readonly map: SongMap;
      readonly instruments: Instruments;
    }
  | {
      readonly kind: "diff";
      readonly diff: SongDiff;
      readonly map: SongMap;
      readonly instruments: Instruments;
    }
  | {
      readonly kind: "pattern";
      readonly side: PatternSide;
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
  scope.postMessage({
    kind: "song",
    slot,
    name,
    song,
    map: songMap(song),
    instruments: instruments(song),
  });

  const before = loaded.get("before");
  const after = loaded.get("after");
  if (before === undefined || after === undefined) return;

  alignment = alignTracks(before, after);
  const diff = diffSongs(before, after, alignment);
  scope.postMessage({ kind: "diff", diff, map: songMap(after), instruments: instruments(after) });
}

/** Tracks that play nothing are dropped: a group or send track holds no notes to attribute */
function instruments(song: Song): Instruments {
  const rows = instrumentUse(song)
    .filter((use) => use.notes > 0 || use.unknown > 0)
    .map((use) => {
      const color = song.tracks[use.track]?.color;
      return {
        track: song.tracks[use.track]?.name ?? "",
        ...(color !== undefined && { color: `rgb(${color.join(" ")})` }),
        notes: use.notes,
        unknown: use.unknown,
        instruments: use.instruments.map((one) => ({
          name: instrumentName(song, one.instrument),
          notes: one.notes,
        })),
      };
    });

  const catalog = song.instruments.filter((one) => one.name !== "").map((one) => one.name);
  return { rows, catalog };
}

/** Renoise numbers instruments in hex and shows that number wherever a name is empty */
function instrumentName(song: Song, index: number): string {
  const name = song.instruments[index]?.name ?? "";
  return name === "" ? index.toString(16).toUpperCase().padStart(2, "0") : name;
}

/**
 * Stands in for the side a pattern does not exist on
 *
 * No tracks, so every aligned slot finds nothing there and the whole of the other side
 * reads as added or removed. An added pattern needs no rendering path of its own
 */
const NO_PATTERN: Pattern = { index: -1, numberOfLines: 0, tracks: [] };

function openPattern(request: PatternRequest): void {
  const before = loaded.get("before");
  const after = loaded.get("after");
  if (before === undefined || after === undefined || alignment === undefined) return;

  const from = request.from === undefined ? NO_PATTERN : before.patterns[request.from];
  const to = request.to === undefined ? NO_PATTERN : after.patterns[request.to];
  if (from === undefined || to === undefined) return;

  const diff = diffPattern(from, to, alignment);
  const linesPerBeat = { from: before.linesPerBeat, to: after.linesPerBeat };
  scope.postMessage({
    kind: "pattern",
    side: sideOf(request),
    from,
    to,
    diff,
    alignment,
    linesPerBeat,
  });
}

function sideOf(request: PatternRequest): PatternSide {
  if (request.from === undefined) return "added";
  if (request.to === undefined) return "removed";
  return "both";
}
