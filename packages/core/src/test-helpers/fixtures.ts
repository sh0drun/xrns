import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSongXml, readXrns } from "../xrns/archive.js";
import { readSong } from "../xrns/reader.js";
import { parseSongXml } from "../xrns/song-document.js";
import type { Song } from "../domain/song.js";

/**
 * Songs saved from Renoise 3.5.4, with their SampleData entries removed. Core reads
 * Song.xml and nothing else, so dropping the audio changes no test, and it keeps
 * Renoise's bundled sample content out of a public repository.
 *
 * They are phrase-heavy and hold almost nothing in their pattern pools, so use the
 * Renoise library below for anything that needs dense pattern data.
 */
export const FIXTURE_NAMES = ["test", "song", "kits", "song_renoise"] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function fixturePath(name: FixtureName): string {
  return fileURLToPath(new URL(`../../fixtures/${name}.xrns`, import.meta.url));
}

export function readFixture(name: FixtureName): Promise<Buffer> {
  return readFile(fixturePath(name));
}

/** The whole read path in one call: archive, document, domain. */
export async function loadSong(path: string): Promise<Song> {
  return readSong(parseSongXml(readSongXml(readXrns(await readFile(path)))));
}

export function loadFixtureSong(name: FixtureName): Promise<Song> {
  return loadSong(fixturePath(name));
}

/**
 * Demo and tutorial songs shipped with Renoise. These are dense, pattern-based,
 * span several doc_versions and include group tracks, which makes them far better
 * coverage than the committed fixtures.
 *
 * They are third-party copyrighted content and are deliberately not vendored, so
 * they are read from the local install and every test using them skips when it is
 * absent. Set RENOISE_LIBRARY_SONGS to point at them explicitly.
 */
export function renoiseLibrarySongs(): string[] {
  const dir = locateLibrary();
  if (dir === undefined) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".xrns"))
    .sort()
    .map((name) => join(dir, name));
}

function locateLibrary(): string | undefined {
  const configured = process.env.RENOISE_LIBRARY_SONGS;
  if (configured !== undefined && configured !== "") {
    return existsAsDirectory(configured) ? configured : undefined;
  }
  for (const root of ["C:\\Program Files", "C:\\Program Files (x86)"]) {
    if (!existsAsDirectory(root)) continue;
    const install = readdirSync(root)
      .filter((name) => name.startsWith("Renoise"))
      .sort()
      .at(-1);
    if (install === undefined) continue;
    const songs = join(root, install, "Resources", "Library", "Songs");
    if (existsAsDirectory(songs)) return songs;
  }
  return undefined;
}

function existsAsDirectory(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}
