import { XMLBuilder, XMLParser } from "fast-xml-parser";

/**
 * Song.xml parsed with order preserved.
 *
 * Every element, attribute and text node survives the round trip, including the
 * parts of the schema this project does not model. That is the point: a song
 * carries modulation sets, filter devices, phrases and automation that we cannot
 * describe, and rebuilding the file from a partial model would discard all of it.
 * Edits are applied to this tree in place, never regenerated from a domain object.
 *
 * The shape is fast-xml-parser's preserveOrder form: an ordered array of
 * single-key objects, where the key is the element name and the value is the
 * ordered array of its children. Attributes live under ATTRIBUTES_KEY, text under
 * TEXT_KEY.
 */
export type XmlNode = Record<string, unknown>;
export type XmlNodes = XmlNode[];

export const TEXT_KEY = "#text";
export const ATTRIBUTES_KEY = ":@";
const ATTRIBUTE_PREFIX = "@_";

const SHARED_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  textNodeName: TEXT_KEY,
  // Renoise writes every value as text. Coercing "00" to 0 or "false" to a boolean
  // would lose the exact lexical form we are obliged to write back.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
} as const;

const parser = new XMLParser(SHARED_OPTIONS);

// fast-xml-parser 5.10 marks XMLBuilder deprecated in favour of the separate
// fast-xml-builder package. That package is six months old and still moving; this
// one is the serializer the round-trip suite is validated against. Revisit once it
// has settled, and only behind a full re-run of that suite.
// eslint-disable-next-line @typescript-eslint/no-deprecated
const builder = new XMLBuilder({
  ...SHARED_OPTIONS,
  // Renoise uses self-closing tags for empty note and effect columns, and those
  // hold column positions rather than being decorative.
  suppressEmptyNode: true,
  format: true,
  indentBy: "  ",
});

export function parseSongXml(xml: string): XmlNodes {
  return parser.parse(xml) as XmlNodes;
}

export function buildSongXml(nodes: XmlNodes): string {
  return builder.build(nodes);
}

export function attributesOf(node: XmlNode): Record<string, string> | undefined {
  return node[ATTRIBUTES_KEY] as Record<string, string> | undefined;
}

export function attributeName(name: string): string {
  return `${ATTRIBUTE_PREFIX}${name}`;
}

/** The element name of a node, or undefined for a text node. */
export function tagNameOf(node: XmlNode): string | undefined {
  return Object.keys(node).find((key) => key !== ATTRIBUTES_KEY && key !== TEXT_KEY);
}

/**
 * The children of `tag` within `node`. In preserveOrder form an element's value is
 * its ordered child list, so this is the single way to descend the tree.
 */
export function childrenOf(node: XmlNode, tag: string): XmlNodes {
  return (node[tag] as XmlNodes | undefined) ?? [];
}

/** Text of a leaf element's children, as in `<Note>C-4</Note>`. Empty when there is none. */
export function textOf(children: XmlNodes): string {
  return children.map((child) => (child[TEXT_KEY] as string | undefined) ?? "").join("");
}

/** The children of a node, whatever its element name. */
export function contentOf(node: XmlNode): XmlNodes {
  const tag = tagNameOf(node);
  return tag === undefined ? [] : childrenOf(node, tag);
}

/** Replaces a node's children, keeping its element name. */
export function setContent(node: XmlNode, children: XmlNodes): void {
  const tag = tagNameOf(node);
  if (tag !== undefined) node[tag] = children;
}

/** Every element named `tag` among `nodes`, in document order. */
export function elementsOf(nodes: XmlNodes, tag: string): XmlNodes {
  return nodes.filter((node) => tagNameOf(node) === tag);
}

export function findElement(nodes: XmlNodes, tag: string): XmlNode | undefined {
  return nodes.find((node) => tagNameOf(node) === tag);
}

/** The children of the first `tag` among `nodes`, or an empty list if there is none. */
export function childrenIn(nodes: XmlNodes, tag: string): XmlNodes {
  const element = findElement(nodes, tag);
  return element === undefined ? [] : childrenOf(element, tag);
}

/**
 * Text of the first `tag` among `nodes`.
 *
 * An element with empty text reads as absent. Renoise emits a column field only when
 * it is set, so the two cases mean the same thing and collapsing them keeps every
 * caller from having to test for both.
 */
export function textIn(nodes: XmlNodes, tag: string): string | undefined {
  const element = findElement(nodes, tag);
  if (element === undefined) return undefined;
  const value = textOf(childrenOf(element, tag));
  return value === "" ? undefined : value;
}

export function attributeOf(node: XmlNode, name: string): string | undefined {
  return attributesOf(node)?.[attributeName(name)];
}

export function element(
  tag: string,
  children: XmlNodes = [],
  attributes?: Record<string, string>,
): XmlNode {
  const node: XmlNode = { [tag]: children };
  if (attributes !== undefined) {
    node[ATTRIBUTES_KEY] = Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [attributeName(name), value]),
    );
  }
  return node;
}

/** A leaf carrying text, as in `<Note>C-4</Note>`. */
export function textElement(tag: string, value: string): XmlNode {
  return { [tag]: [{ [TEXT_KEY]: value }] };
}

/**
 * Replaces the children of the first `tag` among `nodes`, adding the element before
 * `before` if it is not there yet. Position matters: Renoise writes a fixed element
 * order and this keeps a created element in the right place rather than at the end.
 */
export function setChildren(
  nodes: XmlNodes,
  tag: string,
  children: XmlNodes,
  before?: string,
): void {
  const existing = findElement(nodes, tag);
  if (existing !== undefined) {
    existing[tag] = children;
    return;
  }

  const at = before === undefined ? -1 : nodes.findIndex((node) => tagNameOf(node) === before);
  const created = element(tag, children);
  if (at === -1) nodes.push(created);
  else nodes.splice(at, 0, created);
}

export function setText(nodes: XmlNodes, tag: string, value: string, before?: string): void {
  setChildren(nodes, tag, [{ [TEXT_KEY]: value }], before);
}
