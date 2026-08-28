import type { SongMap } from "@xrns/core/analysis/song-map.js";
import type { Song } from "@xrns/core/domain/song.js";
import { renderMap } from "./render-map.js";
import type { Track } from "@xrns/core/domain/track.js";

export function renderSong(fileName: string, song: Song, map: SongMap): Node {
  const view = document.createElement("div");
  view.className = "song";
  view.append(
    header(fileName, song),
    tracks(song),
    renderMap({
      map,
      names: song.tracks.map((track) => track.name),
      pairs: new Map(),
      changed: new Map(),
    }),
    sequence(song),
  );
  return view;
}

function header(fileName: string, song: Song): Node {
  const element = document.createElement("header");
  element.className = "song-header";

  const title = document.createElement("h1");
  title.textContent = song.name === "" ? fileName : song.name;

  const fields = document.createElement("div");
  fields.className = "fields";
  if (song.artist !== "") fields.append(field("artist", song.artist));
  fields.append(
    field("bpm", String(song.beatsPerMinute)),
    field("lpb", String(song.linesPerBeat)),
    field("patterns", String(song.patterns.length)),
    field("tracks", String(song.tracks.length)),
  );

  element.append(title, fields);
  return element;
}

function field(label: string, value: string): Node {
  const element = document.createElement("span");
  element.className = "field";

  const name = document.createElement("span");
  name.className = "field-label";
  name.textContent = label;

  const content = document.createElement("span");
  content.className = "field-value";
  content.textContent = value;

  element.append(name, content);
  return element;
}

function tracks(song: Song): Node {
  const list = document.createElement("ol");
  list.className = "tracks";

  for (const track of song.tracks) {
    const item = document.createElement("li");
    item.className = `track track-${track.type}`;
    item.style.setProperty("--depth", String(track.groupNestingLevel));
    item.title = `${String(track.visibleNoteColumns)} note, ${String(track.visibleEffectColumns)} effect columns`;
    item.append(indexLabel(track.index), trackName(track));
    list.append(item);
  }

  return list;
}

function indexLabel(index: number): Node {
  const element = document.createElement("span");
  element.className = "track-index";
  element.textContent = String(index).padStart(2, "0");
  return element;
}

function trackName(track: Track): Node {
  const element = document.createElement("span");
  element.className = "track-name";
  element.textContent = track.name === "" ? track.type : track.name;
  return element;
}

/** Section starts are the composer's own marks, so they break the strip rather than decorate it */
function sequence(song: Song): Node {
  const strip = document.createElement("ol");
  strip.className = "sequence";

  for (const entry of song.sequence) {
    const item = document.createElement("li");
    item.className = "slot";
    if (entry.isSectionStart) item.classList.add("section-start");
    item.textContent = String(entry.patternIndex).padStart(2, "0");
    if (entry.sectionName !== undefined) item.title = entry.sectionName;
    strip.append(item);
  }

  return strip;
}
