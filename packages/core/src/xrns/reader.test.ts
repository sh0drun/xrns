import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { OLDEST_SUPPORTED_DOC_VERSION } from "./reader.js";
import { formatNote } from "../domain/note.js";
import { isAliased, linesAt } from "../domain/pattern.js";
import type { PatternTrack } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";
import {
  FIXTURE_NAMES,
  loadFixtureSong,
  loadSong,
  renoiseLibrarySongs,
} from "../test-helpers/fixtures.js";

const libraryPaths = renoiseLibrarySongs();

/**
 * song.xrns is the fixture with real pattern content, so it carries the assertions
 * that pin what the reader actually returns. The rest are checked against invariants
 * that must hold for any song, which is all that can be said about files whose
 * contents are not known ahead of time.
 */
describe("reading song.xrns", () => {
  it("reads the song's own description of itself", async () => {
    const song = await loadFixtureSong("song");

    expect(song.name).toBe("Untitled");
    expect(song.artist).toBe("Somebody");
    expect(song.beatsPerMinute).toBe(136);
    expect(song.linesPerBeat).toBe(4);
    expect(song.ticksPerLine).toBe(12);
  });

  it("reads the track list with its types and names", async () => {
    const song = await loadFixtureSong("song");

    expect(song.tracks).toHaveLength(10);
    expect(song.tracks.map((track) => track.type)).toEqual([
      ...Array.from({ length: 8 }, () => "sequencer"),
      "master",
      "send",
    ]);
    expect(song.tracks.map((track) => track.name)).toEqual([
      "Track 01",
      "Track 02",
      "Track 03",
      "Track 04",
      "Track 05",
      "Track 06",
      "Track 07",
      "Track 08",
      "Mst",
      "S01",
    ]);
    expect(song.tracks[0]?.visibleNoteColumns).toBe(1);
  });

  it("reads a kick pattern as the notes a tracker would show", async () => {
    const song = await loadFixtureSong("song");
    const pattern = song.patterns[0];
    const track = pattern?.tracks[0];

    expect(pattern?.numberOfLines).toBe(64);
    expect(track?.lines.map((line) => line.index)).toEqual([0, 8, 16, 24, 32, 40, 48, 56]);

    const first = track?.lines[0]?.noteColumns[0];
    expect(first?.note && formatNote(first.note)).toBe("C-3");
    expect(first?.instrument).toBe("00");
    // Volume is emitted only where it is set, so the downbeat has none.
    expect(first?.volume).toBeUndefined();
    expect(track?.lines[1]?.noteColumns[0]?.volume).toBe("5A");
  });

  it("keeps every entry where one line index is used more than once", async () => {
    const song = await loadFixtureSong("song");
    const track = song.patterns[0]?.tracks[4];
    const atZero = track === undefined ? [] : linesAt(track, 0);

    // Three entries, each holding one note of a chord. Dropping the repeats would
    // lose two thirds of it.
    expect(
      atZero.map((line) => {
        const note = line.noteColumns[0]?.note;
        return note === undefined ? "" : formatNote(note);
      }),
    ).toEqual(["C-4", "D#4", "G-4"]);
  });

  it("reads the sequence as positions rather than pattern indices", async () => {
    const song = await loadFixtureSong("song");

    expect(song.sequence).toHaveLength(12);
    expect(song.sequence.map((entry) => entry.position)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
    expect(song.sequence.map((entry) => entry.patternIndex)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
  });
});

/**
 * Invariants that hold for any readable song. The committed fixtures cover these in
 * CI; the Renoise library adds group tracks, aliased pattern tracks and four older
 * document versions, none of which the fixtures contain.
 */
function expectSongInvariants(song: Song): void {
  expect(song.docVersion).toBeGreaterThanOrEqual(OLDEST_SUPPORTED_DOC_VERSION);
  expect(song.tracks.length).toBeGreaterThan(0);
  expect(song.beatsPerMinute).toBeGreaterThan(0);

  expect(song.tracks.map((track) => track.index)).toEqual(song.tracks.map((_, index) => index));

  for (const pattern of song.patterns) {
    // A pattern's track list is positionally aligned with the song's, which is the
    // only thing tying a note to a named track.
    expect(pattern.tracks).toHaveLength(song.tracks.length);
    expect(pattern.tracks.map((track) => track.trackIndex)).toEqual(
      song.tracks.map((_, index) => index),
    );
    for (const track of pattern.tracks) expectPatternTrackInvariants(track);
  }

  for (const entry of song.sequence) {
    expect(entry.patternIndex).toBeGreaterThanOrEqual(0);
    expect(entry.patternIndex).toBeLessThan(song.patterns.length);
  }
}

function expectPatternTrackInvariants(track: PatternTrack): void {
  for (const line of track.lines) expect(line.index).toBeGreaterThanOrEqual(0);
  if (isAliased(track)) {
    expect(track.aliasPatternIndex).toBeGreaterThanOrEqual(0);
  }
}

describe("reader invariants", () => {
  it.each(FIXTURE_NAMES)("%s.xrns reads as a well-formed song", async (name) => {
    expectSongInvariants(await loadFixtureSong(name));
  });

  it.each(libraryPaths.map((path) => [basename(path), path] as const))(
    "%s reads as a well-formed song",
    async (_name, path) => {
      expectSongInvariants(await loadSong(path));
    },
  );

  it.skipIf(libraryPaths.length === 0)("covers what the committed fixtures cannot", async () => {
    const songs = await Promise.all(libraryPaths.map(loadSong));

    expect(songs.some((song) => song.tracks.some((track) => track.type === "group"))).toBe(true);
    expect(
      songs.some((song) => song.patterns.some((pattern) => pattern.tracks.some(isAliased))),
    ).toBe(true);

    // The library spans five document versions and the reader takes all of them
    // through the same element names.
    expect([...new Set(songs.map((song) => song.docVersion))].sort((a, b) => a - b)).toEqual([
      54, 63, 64, 66, 67,
    ]);
  });

  it.skipIf(libraryPaths.length === 0)(
    "keeps lines that sit past the end of their pattern",
    async () => {
      const songs = await Promise.all(libraryPaths.map(loadSong));

      // Shortening a pattern leaves its later lines in the file, unplayed. Twelve of
      // the library's songs carry some. Reading them as corruption would reject half
      // the library, and dropping them would delete work on the next save.
      const pastEnd = songs.flatMap((song) =>
        song.patterns.flatMap((pattern) =>
          pattern.tracks.flatMap((track) =>
            track.lines.filter((line) => line.index >= pattern.numberOfLines),
          ),
        ),
      );

      expect(pastEnd.length).toBeGreaterThan(0);
    },
  );
});
