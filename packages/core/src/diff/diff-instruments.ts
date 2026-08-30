import type { Instrument, Sample } from "../domain/instrument.js";
import type { Song } from "../domain/song.js";
import { change } from "./song-diff.js";
import type { Change } from "./song-diff.js";

export type SampleProperty = "name" | "volume" | "panning" | "transpose" | "finetune";
export type LoopField = "loopMode" | "loopStart" | "loopEnd";
export type MappingField = "baseNote" | "noteStart" | "noteEnd" | "velocityStart" | "velocityEnd";

/** Named so a caller can label a change without knowing the sample it came from */
export type SampleField = SampleProperty | LoopField | MappingField;

/** Only the fields that differ, so a caller never filters thirteen "same" entries */
export interface SampleFieldChange {
  readonly field: SampleField;
  readonly from: string | number;
  readonly to: string | number;
}

export type SampleMatch =
  | { readonly kind: "added"; readonly index: number; readonly sample: Sample }
  | { readonly kind: "removed"; readonly index: number; readonly sample: Sample }
  | { readonly kind: "identical"; readonly index: number; readonly sample: Sample }
  | {
      readonly kind: "modified";
      readonly index: number;
      readonly name: string;
      readonly fields: readonly SampleFieldChange[];
    };

export type InstrumentMatch =
  | { readonly kind: "added"; readonly index: number; readonly instrument: Instrument }
  | { readonly kind: "removed"; readonly index: number; readonly instrument: Instrument }
  | { readonly kind: "identical"; readonly index: number; readonly instrument: Instrument }
  | {
      readonly kind: "modified";
      readonly index: number;
      readonly name: Change<string>;
      readonly samples: readonly SampleMatch[];
    };

/**
 * Instruments compared slot by slot
 *
 * Positional on purpose, and the opposite of how tracks are matched. A note names its
 * instrument by number, so slot 3 really is slot 3, and a list that shifted is a song
 * whose notes now play something else. Matching on content would hide exactly that
 */
export function diffInstruments(from: Song, to: Song): InstrumentMatch[] {
  const slots = Math.max(from.instruments.length, to.instruments.length);
  const matches: InstrumentMatch[] = [];

  for (let index = 0; index < slots; index += 1) {
    const match = compare(index, from.instruments[index], to.instruments[index]);
    if (match !== undefined) matches.push(match);
  }

  return matches;
}

/**
 * A slot blank on both sides is not reported at all
 *
 * Renoise keeps unused slots in the list and every song carries a run of them, so
 * calling those identical would bury the few that mean something
 */
function compare(
  index: number,
  older: Instrument | undefined,
  newer: Instrument | undefined,
): InstrumentMatch | undefined {
  const before = blank(older);
  const after = blank(newer);

  if (before && after) return undefined;
  if (before && newer !== undefined) return { kind: "added", index, instrument: newer };
  if (after && older !== undefined) return { kind: "removed", index, instrument: older };
  if (older === undefined || newer === undefined) return undefined;

  const samples = matchSamples(older.samples, newer.samples);
  const name = change(older.name, newer.name);
  if (name.kind === "same" && samples.every((one) => one.kind === "identical")) {
    return { kind: "identical", index, instrument: newer };
  }

  return { kind: "modified", index, name, samples };
}

function blank(instrument: Instrument | undefined): boolean {
  return instrument === undefined || (instrument.samples.length === 0 && instrument.name === "");
}

/** Samples are positional too: note mappings and slice markers both address them by index */
function matchSamples(from: readonly Sample[], to: readonly Sample[]): SampleMatch[] {
  const slots = Math.max(from.length, to.length);
  const matches: SampleMatch[] = [];

  for (let index = 0; index < slots; index += 1) {
    const older = from[index];
    const newer = to[index];

    if (older === undefined && newer !== undefined) {
      matches.push({ kind: "added", index, sample: newer });
    } else if (newer === undefined && older !== undefined) {
      matches.push({ kind: "removed", index, sample: older });
    } else if (older !== undefined && newer !== undefined) {
      matches.push(compareSample(index, older, newer));
    }
  }

  return matches;
}

function compareSample(index: number, older: Sample, newer: Sample): SampleMatch {
  const fields = changedFields(older, newer);
  if (fields.length === 0) return { kind: "identical", index, sample: newer };
  return { kind: "modified", index, name: newer.name, fields };
}

type FieldPair = readonly [SampleField, string | number, string | number];

function changedFields(from: Sample, to: Sample): SampleFieldChange[] {
  const pairs: readonly FieldPair[] = [
    ["name", from.name, to.name],
    ["volume", from.volume, to.volume],
    ["panning", from.panning, to.panning],
    ["transpose", from.transpose, to.transpose],
    ["finetune", from.finetune, to.finetune],
    ["loopMode", from.loopMode, to.loopMode],
    ["loopStart", from.loopStart, to.loopStart],
    ["loopEnd", from.loopEnd, to.loopEnd],
    ["baseNote", from.mapping.baseNote, to.mapping.baseNote],
    ["noteStart", from.mapping.noteStart, to.mapping.noteStart],
    ["noteEnd", from.mapping.noteEnd, to.mapping.noteEnd],
    ["velocityStart", from.mapping.velocityStart, to.mapping.velocityStart],
    ["velocityEnd", from.mapping.velocityEnd, to.mapping.velocityEnd],
  ];

  return pairs
    .filter(([, before, after]) => before !== after)
    .map(([field, before, after]) => ({ field, from: before, to: after }));
}
