import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { MalformedArchiveError } from "../domain/errors.js";

/** The only entry in a .xrns archive that this project parses. */
export const SONG_XML_ENTRY = "Song.xml";

export interface ArchiveEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/**
 * A .xrns archive held as its complete entry list in original order.
 *
 * Entries other than Song.xml are sample data. They are carried through writes
 * byte for byte and never re-encoded, so a round trip cannot degrade audio.
 */
export interface XrnsArchive {
  readonly entries: readonly ArchiveEntry[];
}

export function readXrns(bytes: Uint8Array): XrnsArchive {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (cause) {
    throw new MalformedArchiveError("not a readable zip archive", { cause });
  }

  const entries = Object.entries(unzipped).map(([name, data]) => ({ name, data }));
  if (!entries.some((entry) => entry.name === SONG_XML_ENTRY)) {
    throw new MalformedArchiveError(`archive contains no ${SONG_XML_ENTRY}`);
  }
  return { entries };
}

export function readSongXml(archive: XrnsArchive): string {
  const entry = archive.entries.find((candidate) => candidate.name === SONG_XML_ENTRY);
  if (!entry) {
    throw new MalformedArchiveError(`archive contains no ${SONG_XML_ENTRY}`);
  }
  return strFromU8(entry.data);
}

/** Replaces Song.xml in place, leaving every other entry and the entry order untouched. */
export function replaceSongXml(archive: XrnsArchive, xml: string): XrnsArchive {
  const data = strToU8(xml);
  return {
    entries: archive.entries.map((entry) =>
      entry.name === SONG_XML_ENTRY ? { name: entry.name, data } : entry,
    ),
  };
}

export function writeXrns(archive: XrnsArchive): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of archive.entries) {
    files[entry.name] = entry.data;
  }
  return zipSync(files, { level: 6 });
}
