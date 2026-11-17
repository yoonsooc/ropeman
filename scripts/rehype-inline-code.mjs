// A browser may break a line after any hyphen, so `ropeman serve --detach` in docs could wrap as
// "--" / "detach". Each short word with a hyphen inside inline code becomes a span the docs page
// keeps on one line; spaces stay as break points, and long words such as URLs still wrap.
const MAX_KEPT = 32;
export const KEEP_CLASS = 'code-word';

/**
 * @typedef {{ type: string, tagName?: string, value?: string, properties?: object, children?: Node[] }} Node
 */

/** @returns {(tree: Node) => void} */
export function rehypeInlineCode() {
	return (tree) => visit(tree, null);
}

/**
 * @param {Node} node
 * @param {Node | null} parent
 */
function visit(node, parent) {
	if (node.type === 'element' && node.tagName === 'code' && parent?.tagName !== 'pre') {
		node.children = (node.children ?? []).flatMap((child) =>
			child.type === 'text' ? splitWords(child.value ?? '') : [child]
		);
		return;
	}
	for (const child of node.children ?? []) visit(child, node);
}

/**
 * @param {string} text
 * @returns {Node[]}
 */
function splitWords(text) {
	return text
		.split(/(\s+)/)
		.filter(Boolean)
		.map((word) =>
			word.includes('-') && word.length <= MAX_KEPT
				? {
						type: 'element',
						tagName: 'span',
						properties: { className: [KEEP_CLASS] },
						children: [{ type: 'text', value: word }]
					}
				: { type: 'text', value: word }
		);
}
