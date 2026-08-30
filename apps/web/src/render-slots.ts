import type { Slot } from "./parse-worker.js";

const SLOTS: readonly Slot[] = ["before", "after"];

/**
 * The two files, always on screen and always replaceable
 *
 * Each slot takes a click or a drop, so which file is the older one is chosen rather
 * than inferred from the order they arrived in
 */
export function renderSlots(
  names: ReadonlyMap<Slot, string>,
  pick: (slot: Slot, file: File) => void,
  example: () => void,
): Node {
  const bar = document.createElement("div");
  bar.className = "file-bar";

  const row = document.createElement("div");
  row.className = "file-slots";
  for (const slot of SLOTS) row.append(renderSlot(slot, names.get(slot), pick));

  bar.append(row, exampleButton(example));
  return bar;
}

/** Two versions of one song, so the tool can be understood without owning a tracker */
function exampleButton(example: () => void): Node {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "example-link";
  button.textContent = "or load an example";
  button.addEventListener("click", example);
  return button;
}

function renderSlot(
  slot: Slot,
  name: string | undefined,
  pick: (slot: Slot, file: File) => void,
): Node {
  const label = document.createElement("label");
  label.className = name === undefined ? "file-slot empty" : "file-slot";

  const title = document.createElement("span");
  title.className = "field-label";
  title.textContent = slot;

  const value = document.createElement("span");
  value.className = "field-value";
  value.textContent = name ?? "choose a file";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xrns";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.item(0);
    if (file) pick(slot, file);
  });

  label.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    label.classList.add("over");
  });

  label.addEventListener("dragleave", () => {
    label.classList.remove("over");
  });

  label.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    label.classList.remove("over");
    const file = event.dataTransfer?.files.item(0);
    if (file) pick(slot, file);
  });

  label.append(title, value, input);
  return label;
}
