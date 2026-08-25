import { describe, expect, it } from "vitest";
import { buildSongXml, childrenOf, parseSongXml, textOf } from "./song-document.js";
import type { XmlNodes } from "./song-document.js";

/**
 * Whole-song round-trip equality proves the tree is stable, but it cannot prove the
 * tree is right: a construct that is dropped on parse stays dropped on reparse and
 * still compares equal. These pin the constructs where being wrong is expensive.
 */

function roundTrip(xml: string): string {
  return buildSongXml(parseSongXml(xml));
}

function descend(nodes: XmlNodes, ...tags: string[]): XmlNodes {
  return tags.reduce((current, tag) => childrenOf(current[0] ?? {}, tag), nodes);
}

describe("song document", () => {
  it("keeps self-closing empty columns, which hold column positions", () => {
    const xml =
      '<Line index="0"><NoteColumns>' +
      "<NoteColumn /><NoteColumn /><NoteColumn><Note>C-4</Note></NoteColumn>" +
      "</NoteColumns></Line>";

    const columns = descend(parseSongXml(xml), "Line", "NoteColumns");

    // The note must remain the third column: dropping the empty two would move it.
    expect(columns).toHaveLength(3);

    const rebuilt = roundTrip(xml);
    expect(rebuilt.match(/<NoteColumn\s*\/>/g)).toHaveLength(2);
    // Values must stay inline. Indented text content would read back as "\n  C-4\n".
    expect(rebuilt).toContain("<Note>C-4</Note>");
    expect(roundTrip(rebuilt)).toBe(rebuilt);
  });

  it("preserves the index attribute that makes Lines sparse", () => {
    const xml = '<Lines><Line index="0"><NoteColumns /></Line><Line index="37" /></Lines>';

    expect(roundTrip(xml)).toContain('index="37"');
    expect(parseSongXml(roundTrip(xml))).toEqual(parseSongXml(xml));
  });

  it("preserves the root doc_version attribute", () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<RenoiseSong doc_version="67" />';

    expect(roundTrip(xml)).toContain('doc_version="67"');
  });

  it("normalises formatting without changing structure", () => {
    const compact =
      '<Lines><Line index="4"><NoteColumns><NoteColumn><Note>C-3</Note>' +
      "</NoteColumn></NoteColumns></Line></Lines>";
    const pretty = [
      "<Lines>",
      '  <Line index="4">',
      "    <NoteColumns>",
      "      <NoteColumn>",
      "        <Note>C-3</Note>",
      "      </NoteColumn>",
      "    </NoteColumns>",
      "  </Line>",
      "</Lines>",
    ].join("\n");

    // Renoise emits both shapes in one file, so they must read as the same song.
    expect(parseSongXml(compact)).toEqual(parseSongXml(pretty));
  });

  it("round-trips entities in text, as found in song and instrument names", () => {
    const xml = "<Name>Sodiufas &amp; Jalex &lt;test&gt;</Name>";

    expect(textOf(descend(parseSongXml(xml), "Name"))).toBe("Sodiufas & Jalex <test>");
    expect(parseSongXml(roundTrip(xml))).toEqual(parseSongXml(xml));
  });

  it("does not coerce values that must be written back verbatim", () => {
    const xml = "<NoteColumn><Instrument>00</Instrument><Volume>0F</Volume></NoteColumn>";

    // "00" must not become the number 0, or it would be written back as "0".
    expect(textOf(descend(parseSongXml(xml), "NoteColumn", "Instrument"))).toBe("00");
    expect(roundTrip(xml)).toContain("<Instrument>00</Instrument>");
  });
});
