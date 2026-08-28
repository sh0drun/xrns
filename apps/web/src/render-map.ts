import type { SongMap, SongMapSection } from "@xrns/core/analysis/song-map.js";

export interface MapView {
  readonly map: SongMap;
  /** Track names by track index */
  readonly names: readonly string[];
  /** Pattern index to the pair id the rest of the view uses, for the hover link */
  readonly pairs: ReadonlyMap<number, string>;
  /** Track indices that differ, by pattern index. Empty for a single song */
  readonly changed: ReadonlyMap<number, ReadonlySet<number>>;
}

const NAME_COLUMN = "16ch";

/**
 * The arrangement: tracks down, playback order across, brightness by how much a track
 * plays there
 *
 * Column widths follow each pattern's length, so the width of a part of the map is the
 * time it takes rather than the number of positions it holds
 */
export function renderMap(view: MapView): Node {
  const element = document.createElement("div");
  element.className = "map";

  const template = columns(view.map.lengths);
  const bands = sectionBands(view.map.sections);

  const stack = document.createElement("div");
  stack.className = "map-stack";
  stack.append(strip(template, timeAxis(view.map.durations)));
  if (namedSections(view)) stack.append(strip(template, sections(view)));
  stack.append(cells(view, template, bands));

  const body = document.createElement("div");
  body.className = "map-body";
  body.append(axisLabel("tracks"), stack);

  element.append(body, key(view.changed.size > 0));
  return element;
}

/**
 * A row of its own rather than a row inside the map
 *
 * One grid holding rows of different shapes lets auto-placement carry the next row's
 * items into the gaps left by this one, which puts every track name in the wrong column
 */
function strip(template: string, marks: Node[]): Node {
  const row = document.createElement("div");
  row.className = "map-strip";
  row.style.gridTemplateColumns = template;
  row.append(gutter(), ...marks);
  return row;
}

function cells(view: MapView, template: string, bands: readonly boolean[]): Node {
  const grid = document.createElement("div");
  grid.className = "song-map";
  grid.style.gridTemplateColumns = template;

  for (const row of view.map.rows) {
    // Group, master and send tracks hold no pattern content, so they would be blank rows
    if (row.cells.every((density) => density === 0)) continue;

    grid.append(name(view.names[row.track] ?? String(row.track)));
    for (const [position, density] of row.cells.entries()) {
      grid.append(cell(view, row.track, position, density, bands[position] ?? false));
    }
  }

  return grid;
}

/** Every other section shaded, so the parts of the song show through the map itself */
function sectionBands(sections: readonly SongMapSection[]): boolean[] {
  const bands: boolean[] = [];
  for (const [index, section] of sections.entries()) {
    for (let offset = 0; offset < section.length; offset += 1) {
      bands[section.start + offset] = index % 2 === 1;
    }
  }
  return bands;
}

/**
 * Markers at round times rather than at every position
 *
 * The step grows with the song so a two minute track is not labelled forty times
 */
function timeAxis(durations: readonly number[]): Node[] {
  const total = durations.reduce((sum, seconds) => sum + seconds, 0);
  const step = total > 600 ? 120 : total > 180 ? 60 : 30;

  const marks: Node[] = [];
  let elapsed = 0;
  let next = 0;

  for (const [position, seconds] of durations.entries()) {
    if (elapsed >= next) {
      marks.push(timeMark(position, next));
      next += step;
    }
    elapsed += seconds;
  }

  return marks;
}

function timeMark(position: number, seconds: number): Node {
  const element = document.createElement("span");
  element.className = "map-time";
  element.style.gridColumn = String(position + 2);
  element.textContent = `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  return element;
}

function axisLabel(text: string): Node {
  const element = document.createElement("span");
  element.className = "map-axis";
  element.textContent = text;
  return element;
}

/** A position that lasts twice as long is twice as wide, with a floor so none vanish */
function columns(lengths: readonly number[]): string {
  const widths = lengths.map((lines) => `${String(Math.max(1, lines))}fr`);
  return [NAME_COLUMN, ...widths].join(" ");
}

function gutter(): Node {
  const element = document.createElement("span");
  element.className = "map-gutter";
  return element;
}

/** Only worth a row of its own when the composer actually named parts of the song */
function namedSections(view: MapView): boolean {
  return view.map.sections.some((section) => section.name !== undefined);
}

function sections(view: MapView): Node[] {
  return view.map.sections.map((section) => {
    const element = document.createElement("span");
    element.className = "map-section";
    element.style.gridColumn = `span ${String(section.length)}`;
    element.textContent = section.name ?? "";
    return element;
  });
}

function name(text: string): Node {
  const element = document.createElement("span");
  element.className = "map-name";
  element.textContent = text;
  element.title = text;
  return element;
}

function cell(
  view: MapView,
  track: number,
  position: number,
  density: number,
  startsSection: boolean,
): Node {
  const element = document.createElement("span");
  element.className = startsSection ? "map-cell section-edge" : "map-cell";

  const pattern = view.map.positions[position];
  if (pattern === undefined) return element;

  element.style.setProperty("--density", density.toFixed(3));
  if (view.changed.get(pattern)?.has(track) === true) element.classList.add("map-changed");

  const pair = view.pairs.get(pattern);
  if (pair !== undefined) element.dataset.pair = pair;

  return element;
}

/** The same paint the map uses, so the key can be held against it rather than trusted */
const RAMP: readonly number[] = [0.08, 0.3, 0.55, 0.8, 1];

function key(showsChanges: boolean): Node {
  const element = document.createElement("div");
  element.className = "map-key";

  element.append(swatchRamp());
  if (showsChanges) element.append(swatchItem("map-cell map-changed", "changed"));
  element.append(note("rows are tracks, left to right is the song"));

  return element;
}

function swatchRamp(): Node {
  const item = document.createElement("span");
  item.className = "key-item";
  item.append(note("fewer notes"));

  const ramp = document.createElement("span");
  ramp.className = "key-ramp";
  for (const density of RAMP) {
    const swatch = document.createElement("span");
    swatch.className = "map-cell";
    swatch.style.setProperty("--density", String(density));
    ramp.append(swatch);
  }

  item.append(ramp, note("more"));
  return item;
}

function swatchItem(className: string, label: string): Node {
  const item = document.createElement("span");
  item.className = "key-item";

  const swatch = document.createElement("span");
  swatch.className = className;

  item.append(swatch, note(label));
  return item;
}

function note(text: string): Node {
  const element = document.createElement("span");
  element.className = "key-note";
  element.textContent = text;
  return element;
}
