import { MalformedSongError, UnsupportedVersionError } from "../domain/errors.js";
import type { EffectColumn, Line, NoteColumn } from "../domain/line.js";
import { parseNote } from "../domain/note.js";
import type { Pattern, PatternTrack } from "../domain/pattern.js";
import type { SequenceEntry } from "../domain/sequence.js";
import type { Song } from "../domain/song.js";
import type { Track, TrackType } from "../domain/track.js";
import {
  attributeOf,
  childrenIn,
  contentOf,
  elementsOf,
  findElement,
  tagNameOf,
  textIn,
} from "./song-document.js";
import type { XmlNode, XmlNodes } from "./song-document.js";

/**
 * Document tree to domain model. One direction only: nothing here is used to write a
 * song back, so the model is free to be a partial view.
 */

/**
 * The oldest version verified to read. Renoise's own library spans 54, 63, 64, 66 and
 * 67, and every one of them parses through the same element names.
 *
 * There is no upper bound. This reader addresses elements by name, so a future version
 * that renames one fails as a malformed song naming the element, which is more useful
 * than refusing a file that would have read correctly.
 */
export const OLDEST_SUPPORTED_DOC_VERSION = 54;

const SONG_TRACK_TYPES = new Map<string, TrackType>([
  ["SequencerTrack", "sequencer"],
  ["SequencerGroupTrack", "group"],
  ["SequencerMasterTrack", "master"],
  ["SequencerSendTrack", "send"],
]);

const PATTERN_TRACK_TYPES = new Map<string, TrackType>([
  ["PatternTrack", "sequencer"],
  ["PatternGroupTrack", "group"],
  ["PatternMasterTrack", "master"],
  ["PatternSendTrack", "send"],
]);

/** -1 is how the file spells "this track is not an alias". */
const NOT_ALIASED = -1;

export function readSong(document: XmlNodes): Song {
  const root = findElement(document, "RenoiseSong");
  if (root === undefined) {
    throw new MalformedSongError("Song.xml has no RenoiseSong element");
  }

  const docVersion = readDocVersion(root);
  const song = contentOf(root);
  const global = childrenIn(song, "GlobalSongData");
  const tracks = readTracks(childrenIn(song, "Tracks"));

  return {
    docVersion,
    name: textIn(global, "SongName") ?? "",
    artist: textIn(global, "Artist") ?? "",
    beatsPerMinute: numberIn(global, "BeatsPerMin", 120),
    linesPerBeat: numberIn(global, "LinesPerBeat", 4),
    ticksPerLine: numberIn(global, "TicksPerLine", 12),
    tracks,
    patterns: readPatterns(childrenIn(childrenIn(song, "PatternPool"), "Patterns"), tracks),
    sequence: readSequence(childrenIn(childrenIn(song, "PatternSequence"), "SequenceEntries")),
  };
}

function readDocVersion(root: XmlNode): number {
  const raw = attributeOf(root, "doc_version");
  const version = Number(raw);
  if (raw === undefined || !Number.isInteger(version)) {
    throw new MalformedSongError("RenoiseSong has no readable doc_version attribute");
  }
  if (version < OLDEST_SUPPORTED_DOC_VERSION) {
    throw new UnsupportedVersionError(version, `${String(OLDEST_SUPPORTED_DOC_VERSION)} or newer`);
  }
  return version;
}

function readTracks(nodes: XmlNodes): Track[] {
  return nodes.map((node, index) => {
    const tag = tagNameOf(node) ?? "";
    const type = SONG_TRACK_TYPES.get(tag);
    if (type === undefined) {
      throw new MalformedSongError(`Unknown track element <${tag}> at track ${String(index)}`);
    }
    const children = contentOf(node);
    return {
      index,
      type,
      name: textIn(children, "Name") ?? "",
      visibleNoteColumns: numberIn(children, "NumberOfVisibleNoteColumns", 0),
      visibleEffectColumns: numberIn(children, "NumberOfVisibleEffectColumns", 0),
      groupNestingLevel: numberIn(children, "GroupNestingLevel", 0),
    };
  });
}

function readPatterns(nodes: XmlNodes, tracks: readonly Track[]): Pattern[] {
  return elementsOf(nodes, "Pattern").map((node, index) => {
    const children = contentOf(node);
    const name = textIn(children, "Name");
    return {
      index,
      ...(name !== undefined && { name }),
      numberOfLines: numberIn(children, "NumberOfLines", 0),
      tracks: readPatternTracks(childrenIn(children, "Tracks"), tracks, index),
    };
  });
}

/**
 * The song's track list and a pattern's are positionally aligned, which is the only
 * thing that connects a pattern's contents to a named track. A mismatch is treated
 * as a corrupt file rather than recovered from, because reading on regardless would
 * quietly attribute every note to the wrong track.
 */
function readPatternTracks(
  nodes: XmlNodes,
  tracks: readonly Track[],
  patternIndex: number,
): PatternTrack[] {
  if (nodes.length !== tracks.length) {
    throw new MalformedSongError(
      `Pattern ${String(patternIndex)} has ${String(nodes.length)} tracks but the song has ` +
        String(tracks.length),
    );
  }

  return nodes.map((node, index) => {
    const tag = tagNameOf(node) ?? "";
    const type = PATTERN_TRACK_TYPES.get(tag);
    if (type !== tracks[index]?.type) {
      throw new MalformedSongError(
        `Pattern ${String(patternIndex)} track ${String(index)} is <${tag}> but the song has a ` +
          `${tracks[index]?.type ?? "missing"} track there`,
      );
    }

    const children = contentOf(node);
    const alias = numberIn(children, "AliasPatternIndex", NOT_ALIASED);
    return {
      trackIndex: index,
      ...(alias !== NOT_ALIASED && { aliasPatternIndex: alias }),
      lines: readLines(childrenIn(children, "Lines")),
    };
  });
}

function readLines(nodes: XmlNodes): Line[] {
  return elementsOf(nodes, "Line").map((node) => {
    const children = contentOf(node);
    return {
      index: Number(attributeOf(node, "index") ?? 0),
      noteColumns: elementsOf(childrenIn(children, "NoteColumns"), "NoteColumn").map(
        readNoteColumn,
      ),
      effectColumns: elementsOf(childrenIn(children, "EffectColumns"), "EffectColumn").map(
        readEffectColumn,
      ),
    };
  });
}

function readNoteColumn(node: XmlNode): NoteColumn {
  const children = contentOf(node);
  const note = textIn(children, "Note");
  const instrument = textIn(children, "Instrument");
  const volume = textIn(children, "Volume");
  const panning = textIn(children, "Panning");
  const delay = textIn(children, "Delay");
  const effectNumber = textIn(children, "EffectNumber");
  const effectValue = textIn(children, "EffectValue");

  return {
    ...(note !== undefined && { note: parseNote(note) }),
    ...(instrument !== undefined && { instrument }),
    ...(volume !== undefined && { volume }),
    ...(panning !== undefined && { panning }),
    ...(delay !== undefined && { delay }),
    ...(effectNumber !== undefined && { effectNumber }),
    ...(effectValue !== undefined && { effectValue }),
  };
}

function readEffectColumn(node: XmlNode): EffectColumn {
  const children = contentOf(node);
  const number = textIn(children, "Number");
  const value = textIn(children, "Value");

  return {
    ...(number !== undefined && { number }),
    ...(value !== undefined && { value }),
  };
}

function readSequence(nodes: XmlNodes): SequenceEntry[] {
  return elementsOf(nodes, "SequenceEntry").map((node, position) => {
    const children = contentOf(node);
    const sectionName = textIn(children, "SectionName");
    return {
      position,
      patternIndex: numberIn(children, "Pattern", 0),
      isSectionStart: textIn(children, "IsSectionStart") === "true",
      ...(sectionName !== undefined && { sectionName }),
    };
  });
}

function numberIn(nodes: XmlNodes, tag: string, fallback: number): number {
  const value = Number(textIn(nodes, tag));
  return Number.isFinite(value) ? value : fallback;
}
