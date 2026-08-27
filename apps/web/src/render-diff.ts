import type {
  Change,
  PatternMatch,
  SequenceChange,
  SongDiff,
  TrackChange,
} from "@xrns/core/diff/song-diff.js";
import type { SequenceEntry } from "@xrns/core/domain/sequence.js";

export function renderDiff(before: string, after: string, diff: SongDiff): Node {
  const view = document.createElement("div");
  view.className = "diff";
  const pairs = pairPatterns(diff.patterns);
  view.append(
    files(before, after),
    meta(diff),
    section("tracks", trackList(diff.tracks)),
    section("sequence", sequenceRows(diff.sequence, pairs)),
    section("patterns", patternList(diff.patterns, trackNames(diff.tracks), pairs)),
  );
  link(view);
  return view;
}

/**
 * A pattern keeps one identity across both songs
 *
 * Matching on the pattern index instead would link the wrong things, since the before
 * row is numbered in the older song and the after row in the newer one
 */
interface Pairs {
  readonly older: ReadonlyMap<number, string>;
  readonly newer: ReadonlyMap<number, string>;
  readonly of: (match: PatternMatch) => string;
}

function pairPatterns(matches: readonly PatternMatch[]): Pairs {
  const older = new Map<number, string>();
  const newer = new Map<number, string>();
  const identities = new Map<PatternMatch, string>();

  for (const [position, match] of matches.entries()) {
    const id = `p${String(position)}`;
    identities.set(match, id);
    if (match.kind !== "added") older.set(match.from.index, id);
    if (match.kind !== "removed") newer.set(match.to.index, id);
  }

  return { older, newer, of: (match) => identities.get(match) ?? "" };
}

/** Pointing at a pattern anywhere shows every position it plays at, and the reverse */
function link(view: HTMLElement): void {
  const start = (target: EventTarget | null): void => {
    const source = target instanceof Element ? target.closest("[data-pair]") : null;
    const pair = source instanceof HTMLElement ? source.dataset.pair : undefined;
    if (pair === undefined) return;

    view.classList.add("linking");
    for (const element of view.querySelectorAll(`[data-pair="${pair}"]`)) {
      element.classList.add("linked");
    }
  };

  const stop = (): void => {
    view.classList.remove("linking");
    for (const element of view.querySelectorAll(".linked")) element.classList.remove("linked");
  };

  view.addEventListener("pointerover", (event) => {
    start(event.target);
  });
  view.addEventListener("pointerout", stop);
  view.addEventListener("focusin", (event) => {
    start(event.target);
  });
  view.addEventListener("focusout", stop);
}

function files(before: string, after: string): Node {
  const element = document.createElement("header");
  element.className = "diff-files";
  element.append(labelled("before", before), labelled("after", after));
  return element;
}

function labelled(label: string, value: string): Node {
  const element = document.createElement("div");
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

/** Unchanged settings stay on screen dimmed, so the reader can see what was checked */
function meta(diff: SongDiff): Node {
  const element = document.createElement("div");
  element.className = "fields";
  element.append(
    scalar("bpm", diff.meta.beatsPerMinute),
    scalar("lpb", diff.meta.linesPerBeat),
    scalar("tpl", diff.meta.ticksPerLine),
    scalar("name", diff.meta.name),
    scalar("artist", diff.meta.artist),
    scalar("format", diff.meta.docVersion),
  );
  return element;
}

function scalar(label: string, value: Change<string | number>): Node {
  const element = document.createElement("span");
  element.className = value.kind === "changed" ? "field changed" : "field";

  const name = document.createElement("span");
  name.className = "field-label";
  name.textContent = label;

  const content = document.createElement("span");
  content.className = "field-value";
  content.textContent =
    value.kind === "same" ? String(value.value) : `${String(value.from)} → ${String(value.to)}`;

  element.append(name, content);
  return element;
}

function section(title: string, body: Node): Node {
  const element = document.createElement("section");

  const heading = document.createElement("h2");
  heading.textContent = title;

  element.append(heading, body);
  return element;
}

/** changedTracks holds aligned positions, and this is the list they are positions into */
function trackNames(changes: readonly TrackChange[]): string[] {
  return changes.map((change) => {
    if (change.kind !== "kept") return change.track.name;
    return change.name.kind === "same" ? change.name.value : change.name.to;
  });
}

function trackList(changes: readonly TrackChange[]): Node {
  const list = document.createElement("ul");
  list.className = "changes";

  for (const change of changes) {
    if (change.kind === "kept" && change.name.kind === "same" && change.index.kind === "same") {
      continue;
    }
    list.append(trackRow(change));
  }

  if (list.childElementCount === 0) list.append(quiet("no track changed"));
  return list;
}

function trackRow(change: TrackChange): Node {
  const item = document.createElement("li");

  if (change.kind === "added") {
    item.className = "row added";
    item.textContent = `+ ${change.track.name}`;
    return item;
  }

  if (change.kind === "removed") {
    item.className = "row removed";
    item.textContent = `- ${change.track.name}`;
    return item;
  }

  item.className = "row changed";
  const name =
    change.name.kind === "changed" ? `${change.name.from} → ${change.name.to}` : change.name.value;
  const moved =
    change.index.kind === "changed"
      ? ` moved ${String(change.index.from)} to ${String(change.index.to)}`
      : "";
  item.textContent = `~ ${name}${moved}`;
  return item;
}

const COLUMNS_PER_CHUNK = 24;

/**
 * Both orders at once, before above after, one column per aligned position
 *
 * The two rows share a grid rather than being laid out separately, so they cannot drift
 * apart, and a gap in one of them is where an edit happened
 */
function sequenceRows(changes: readonly SequenceChange[], pairs: Pairs): Node {
  const wrapper = document.createElement("div");
  wrapper.className = "sequence-rows";

  if (changes.length === 0) {
    wrapper.append(quiet("no sequence"));
    return wrapper;
  }

  for (let start = 0; start < changes.length; start += COLUMNS_PER_CHUNK) {
    wrapper.append(chunk(changes.slice(start, start + COLUMNS_PER_CHUNK), pairs));
  }

  return wrapper;
}

function chunk(columns: readonly SequenceChange[], pairs: Pairs): Node {
  const grid = document.createElement("div");
  grid.className = "chunk";

  grid.append(gutter("before"));
  for (const column of columns) grid.append(cell(column, "before", pairs));
  for (let filled = columns.length; filled < COLUMNS_PER_CHUNK; filled += 1) {
    grid.append(document.createElement("div"));
  }

  grid.append(gutter("after"));
  for (const column of columns) grid.append(cell(column, "after", pairs));

  return grid;
}

function gutter(label: string): Node {
  const element = document.createElement("div");
  element.className = "gutter";
  element.textContent = label;
  return element;
}

function cell(change: SequenceChange, side: "before" | "after", pairs: Pairs): Node {
  const element = document.createElement("div");
  const entry = entryFor(change, side);

  if (entry === undefined) {
    element.className = "cell gap";
    return element;
  }

  const pair = (side === "before" ? pairs.older : pairs.newer).get(entry.patternIndex);
  element.className = `cell ${change.kind}`;
  element.textContent = String(entry.patternIndex).padStart(2, "0");
  if (pair !== undefined) element.dataset.pair = pair;
  if (entry.isSectionStart) element.classList.add("section-start");
  return element;
}

function entryFor(change: SequenceChange, side: "before" | "after"): SequenceEntry | undefined {
  if (change.kind === "kept") return side === "before" ? change.from : change.to;
  if (change.kind === "inserted") return side === "after" ? change.to : undefined;
  return side === "before" ? change.from : undefined;
}

function patternList(
  matches: readonly PatternMatch[],
  names: readonly string[],
  pairs: Pairs,
): Node {
  const list = document.createElement("ul");
  list.className = "changes";

  let identical = 0;
  for (const match of matches) {
    if (match.kind === "identical") {
      identical += 1;
      continue;
    }
    list.append(patternRow(match, names, pairs));
  }

  if (identical > 0) list.append(quiet(`${String(identical)} unchanged`));
  return list;
}

function patternRow(match: PatternMatch, names: readonly string[], pairs: Pairs): Node {
  const item = document.createElement("li");
  item.dataset.pair = pairs.of(match);
  item.tabIndex = 0;

  if (match.kind === "added") {
    item.className = "row added";
    item.textContent = `+ ${name(match.to.index, match.to.name)}`;
    return item;
  }

  if (match.kind === "removed") {
    item.className = "row removed";
    item.textContent = `- ${name(match.from.index, match.from.name)}`;
    return item;
  }

  if (match.kind === "identical") {
    item.className = "row";
    item.textContent = name(match.to.index, match.to.name);
    return item;
  }

  item.className = "row changed";
  const lines =
    match.numberOfLines.kind === "changed"
      ? ` ${String(match.numberOfLines.from)} to ${String(match.numberOfLines.to)} lines`
      : "";
  const label = document.createElement("span");
  label.textContent = `~ ${name(match.to.index, match.to.name)}${lines}`;

  const tracks = document.createElement("span");
  tracks.className = "row-detail";
  tracks.textContent = listed(match.changedTracks.map((slot) => names[slot] ?? "?"));

  item.append(label, tracks);
  item.title = `similarity ${match.similarity.toFixed(2)}`;
  return item;
}

/** Naming three tracks helps, naming eleven does not */
function listed(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length <= 3) return `  ${names.join(", ")}`;
  return `  ${names.slice(0, 3).join(", ")} and ${String(names.length - 3)} more`;
}

function name(index: number, given: string | undefined): string {
  const label = String(index).padStart(2, "0");
  return given === undefined || given === "" ? label : `${label} ${given}`;
}

function quiet(text: string): Node {
  const item = document.createElement("li");
  item.className = "row quiet";
  item.textContent = text;
  return item;
}
