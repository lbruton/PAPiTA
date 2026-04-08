// DOM construction and event delegation helpers.

function appendChild(parent, child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class" || key === "className") {
      node.className = value;
    } else if (key === "for" || key === "htmlFor") {
      node.htmlFor = value;
    } else if (key.startsWith("data-")) {
      const dataKey = key
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      node.dataset[dataKey] = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node[key.toLowerCase()] = value;
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
  appendChild(node, children);
  return node;
}

export function delegate(root, selector, eventName, handler) {
  root.addEventListener(eventName, (event) => {
    let node = event.target;
    while (node && node !== root) {
      if (node.nodeType === 1 && node.matches(selector)) {
        handler(event, node);
        return;
      }
      node = node.parentNode;
    }
  });
}
