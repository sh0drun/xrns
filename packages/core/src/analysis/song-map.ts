import { isEmptyLine } from "../domain/line.js";
import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { Song } from "../domain/song.js";

export interface SongMapRow {
  readonly track: number;
  /**
   * One value per sequence position, 0 to 1, against this track's own busiest position
   *
   * Relative rather than absolute because the question is when a track is playing, and a
   * dense drum track would otherwise flatten everything else to nothing
   */
  readonly cells: readonly number[];
}

/** A run of positions the composer marked as one part of the song */
export interface SongMapSection {
  readonly name: string | undefined;
  readonly start: number;
  readonly length: number;
}

export interface SongMap {
  readonly rows: readonly SongMapRow[];
  /** Which pattern plays at each position, so a caller can read the map without the song */
  readonly positions: readonly number[];
  /** How many lines each position lasts, so a drawing of it can be proportional to time */
  readonly lengths: readonly number[];
  /**
   * How long each position takes in seconds, at the song's starting tempo
   *
   * A song that changes tempo through effect commands will drift, since those are not
   * read here
   */
  readonly durations: readonly number[];
  readonly sections: readonly SongMapSection[];
}

/** The arrangement as a grid: tracks down, playback order across */
export function songMap(song: Song): SongMap {
  const counts = countsByPattern(song);
  const lengths = song.sequence.map(
    (entry) => song.patterns[entry.patternIndex]?.numberOfLines ?? 0,
  );

  const rows = song.tracks.map((track) => {
    const cells = song.sequence.map((entry) => counts[entry.patternIndex]?.[track.index] ?? 0);
    const busiest = Math.max(0, ...cells);
    return {
      track: track.index,
      cells: busiest === 0 ? cells.map(() => 0) : cells.map((count) => count / busiest),
    };
  });

  return {
    rows,
    positions: song.sequence.map((entry) => entry.patternIndex),
    lengths,
    durations: lengths.map((lines) => lines * secondsPerLine(song)),
    sections: sectionsOf(song),
  };
}

/**
 * The first section runs from the start whether or not it was marked, since a song that
 * marks its second part has a first part too
 */
function sectionsOf(song: Song): SongMapSection[] {
  const sections: SongMapSection[] = [];
  let name: string | undefined;
  let start = 0;

  for (const entry of song.sequence) {
    if (!entry.isSectionStart || entry.position === 0) {
      if (entry.position === 0 && entry.isSectionStart) name = entry.sectionName;
      continue;
    }
    sections.push({ name, start, length: entry.position - start });
    name = entry.sectionName;
    start = entry.position;
  }

  if (song.sequence.length > 0) {
    sections.push({ name, start, length: song.sequence.length - start });
  }

  return sections;
}

function secondsPerLine(song: Song): number {
  const perMinute = song.beatsPerMinute * song.linesPerBeat;
  return perMinute === 0 ? 0 : 60 / perMinute;
}

function countsByPattern(song: Song): number[][] {
  return song.patterns.map((pattern) =>
    pattern.tracks.map((track) => linesWithContent(track, pattern, song)),
  );
}

/**
 * An aliased track has no lines of its own, so it is counted from the pattern it plays
 *
 * Only one hop is followed. Renoise does not chain aliases, and a file that did would
 * otherwise be able to loop this
 */
function linesWithContent(track: PatternTrack, pattern: Pattern, song: Song): number {
  if (track.aliasPatternIndex === undefined) return countLines(track, pattern.numberOfLines);

  const target = song.patterns[track.aliasPatternIndex];
  const aliased = target?.tracks[track.trackIndex];
  if (target === undefined || aliased === undefined || aliased.aliasPatternIndex !== undefined) {
    return 0;
  }

  return countLines(aliased, target.numberOfLines);
}

function countLines(track: PatternTrack, numberOfLines: number): number {
  return track.lines.filter((line) => line.index < numberOfLines && !isEmptyLine(line)).length;
}
