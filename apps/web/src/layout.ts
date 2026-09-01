/** A named box around part of a view, so the stylesheet decides how the parts arrange */
export function group(className: string, children: readonly Node[]): Node {
  const element = document.createElement("div");
  element.className = className;
  element.append(...children);
  return element;
}
