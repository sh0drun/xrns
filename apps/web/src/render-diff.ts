import type {
  Change,
  PatternMatch,
  SequenceChange,
  SongDiff,
  TrackChange,
} from "@xrns/core/diff/song-diff.js";

export function renderDiff(before: string, after: string, diff: SongDiff): Node {
  const view = document.createElement("div");
  view.className = "diff";
  view.append(
    files(before, after),
    meta(diff),
    section("tracks", trackList(diff.tracks)),
    section("sequence", sequenceStrip(diff.sequence)),
    section("patterns", patternList(diff.patterns, trackNames(diff.tracks))),
  );
  return view;
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

/** Kept positions hold their place, so an insertion opens a gap rather than shifting the rest */
function sequenceStrip(changes: readonly SequenceChange[]): Node {
  const strip = document.createElement("ol");
  strip.className = "sequence";

  for (const change of changes) {
    const slot = document.createElement("li");
    slot.className = `slot ${change.kind === "kept" ? "" : change.kind}`.trim();
    const entry = change.kind === "removed" ? change.from : change.to;
    slot.textContent = String(entry.patternIndex).padStart(2, "0");
    if (entry.isSectionStart) slot.classList.add("section-start");
    strip.append(slot);
  }

  return strip;
}

function patternList(matches: readonly PatternMatch[], names: readonly string[]): Node {
  const list = document.createElement("ul");
  list.className = "changes";

  let identical = 0;
  for (const match of matches) {
    if (match.kind === "identical") {
      identical += 1;
      continue;
    }
    list.append(patternRow(match, names));
  }

  if (identical > 0) list.append(quiet(`${String(identical)} unchanged`));
  return list;
}

function patternRow(match: PatternMatch, names: readonly string[]): Node {
  const item = document.createElement("li");

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
