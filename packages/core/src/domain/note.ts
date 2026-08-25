import { InvalidNoteError } from "./errors.js";

/**
 * The contents of a note column's Note field.
 *
 * Absence is modelled by absence: a column with no note simply has no note, so this
 * type has no empty case. Renoise spells every accidental as a sharp and pads a
 * natural to three characters with a hyphen, giving C-4 and D#3.
 */
export type Note = { readonly kind: "off" } | { readonly kind: "pitch"; readonly semitone: number };

export const NOTE_OFF: Note = { kind: "off" };

export const SEMITONES_PER_OCTAVE = 12;
export const HIGHEST_OCTAVE = 9;
export const NOTE_OFF_TEXT = "OFF";

/** Index is the pitch class, so this doubles as the semitone-to-name table. */
const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const PITCH_CLASSES = new Map<string, number>(
  PITCH_CLASS_NAMES.map((name, index) => [name, index]),
);

/** C-0 is 0 through B-9. */
export const LOWEST_SEMITONE = 0;
export const HIGHEST_SEMITONE = (HIGHEST_OCTAVE + 1) * SEMITONES_PER_OCTAVE - 1;

export function pitch(semitone: number): Note {
  if (!Number.isInteger(semitone) || semitone < LOWEST_SEMITONE || semitone > HIGHEST_SEMITONE) {
    throw new InvalidNoteError(String(semitone));
  }
  return { kind: "pitch", semitone };
}

export function pitchOf(pitchClass: number, octave: number): Note {
  return pitch(octave * SEMITONES_PER_OCTAVE + pitchClass);
}

export function octaveOf(note: Note): number | undefined {
  return note.kind === "pitch" ? Math.floor(note.semitone / SEMITONES_PER_OCTAVE) : undefined;
}

export function pitchClassOf(note: Note): number | undefined {
  return note.kind === "pitch" ? note.semitone % SEMITONES_PER_OCTAVE : undefined;
}

/**
 * Rejects spellings the format never produces, such as E# and B#, rather than
 * mapping them onto their enharmonic neighbours. Writing back a note Renoise did
 * not write is how a file stops being the one the composer saved.
 */
export function parseNote(value: string): Note {
  if (value === NOTE_OFF_TEXT) return NOTE_OFF;

  const match = /^([A-G])([-#])([0-9])$/.exec(value);
  if (match === null) throw new InvalidNoteError(value);

  const [, letter = "", accidental = "", octave = ""] = match;
  const pitchClass = PITCH_CLASSES.get(accidental === "#" ? `${letter}#` : letter);
  if (pitchClass === undefined) throw new InvalidNoteError(value);

  return pitchOf(pitchClass, Number(octave));
}

export function formatNote(note: Note): string {
  if (note.kind === "off") return NOTE_OFF_TEXT;

  const name = PITCH_CLASS_NAMES[note.semitone % SEMITONES_PER_OCTAVE] ?? "";
  const octave = Math.floor(note.semitone / SEMITONES_PER_OCTAVE);
  return `${name.length === 1 ? `${name}-` : name}${String(octave)}`;
}
