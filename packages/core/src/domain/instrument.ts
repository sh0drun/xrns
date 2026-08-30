/**
 * How a sample repeats when it is held
 *
 * Off, Forward and PingPong are the three the 22 demo songs use across 659 samples.
 * Anything else reads as "other" rather than being mapped to a guess, since a wrong
 * loop mode is worse than an honest unknown
 */
export type LoopMode = "off" | "forward" | "pingPong" | "other";

/** Which keys and velocities play this sample, and what it is tuned to */
export interface SampleMapping {
  readonly baseNote: number;
  readonly noteStart: number;
  readonly noteEnd: number;
  readonly velocityStart: number;
  readonly velocityEnd: number;
}

/**
 * One sample inside an instrument
 *
 * The audio itself is not here. It lives in the archive as a separate FLAC or OGG file
 * whose path holds the instrument and sample indices, and nothing in this element
 * points at it
 */
export interface Sample {
  readonly index: number;
  readonly name: string;
  readonly volume: number;
  readonly panning: number;
  readonly transpose: number;
  readonly finetune: number;
  readonly loopMode: LoopMode;
  readonly loopStart: number;
  readonly loopEnd: number;
  readonly mapping: SampleMapping;
}

/**
 * An instrument in the song's instrument list
 *
 * Every instrument carries all four of Renoise's generators and plays whichever
 * `activeGenerator` names, so what an instrument is comes from that field rather than
 * from which sub-trees are present. It is kept as the file's own word: every instrument
 * in the demo library says `Samples`, so the spellings Renoise uses for plugin and MIDI
 * instruments are unverified and are not worth guessing at
 */
export interface Instrument {
  readonly index: number;
  readonly name: string;
  readonly activeGenerator: string;
  readonly samples: readonly Sample[];
}

/**
 * True for a slot holding nothing playable
 *
 * Songs are full of these. Renoise keeps unused slots in the list, and composers use
 * named empty ones as separators, so a breakdown that does not skip them is mostly gaps
 */
export function isEmpty(instrument: Instrument): boolean {
  return instrument.samples.length === 0;
}

/** How many keys the sample covers, for reading a drum kit apart from a played instrument */
export function mappedKeys(sample: Sample): number {
  return sample.mapping.noteEnd - sample.mapping.noteStart + 1;
}
