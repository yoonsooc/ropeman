#!/usr/bin/env node
// The icon font is subset to these names, and a name it lacks renders as its ligature word
// ("arrow_back"), so a name this cannot resolve to string literals fails instead of being skipped.
// For the same reason icons render only through the class on a plain element: the class on a
// component, or the font family named anywhere but that class's rule, fails too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import tseslint from 'typescript-eslint';

const ICON_CLASS = 'material-symbols-outlined';
const NAME = /^[a-z0-9_]+$/;
const FAMILY = /material symbols/i;
const FAMILY_ELSEWHERE = `names the icon font family outside the \`.${ICON_CLASS}\` rule; use the class`;

/** @param {string} root */
export function readSources(root) {
	const src = path.join(root, 'src');
	return fs
		.readdirSync(src, { recursive: true, withFileTypes: true })
		.filter(
			(e) => e.isFile() && /\.(svelte|ts|css)$/.test(e.name) && !/\.(test|d)\.ts$/.test(e.name)
		)
		.map((e) => {
			const file = path.join(e.parentPath, e.name);
			return { path: path.relative(root, file), source: fs.readFileSync(file, 'utf8') };
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * @param {{ path: string, source: string }[]} files
 * @returns {string[]}
 */
export function iconNames(files) {
	const names = new Set();
	const problems = [];
	const fieldNames = new Set();
	let readsIconField = false;

	for (const file of files) {
		const { source } = file;
		const where = (node, shift = 0) =>
			`${file.path}:${lineOf(source, (node.start ?? node.range[0]) - shift)}`;
		if (file.path.endsWith('.css')) {
			// The Svelte parser reads a plain stylesheet as the body of a <style> tag
			const STYLE = '<style>';
			const css = parse(`${STYLE}${source}</style>`, { modern: true }).css;
			for (const place of familyRules(css))
				problems.push(`${where(place, STYLE.length)} ${FAMILY_ELSEWHERE}`);
			continue;
		}
		const component = file.path.endsWith('.svelte') ? parse(source, { modern: true }) : undefined;
		const scripts = component
			? [component.instance?.content, component.module?.content].filter(Boolean)
			: [tseslint.parser.parseForESLint(source, { range: true }).ast];
		const code = (node) => source.slice(node.start ?? node.range[0], node.end ?? node.range[1]);

		const leaves = (node, out) => {
			switch (node.type) {
				case 'Literal':
					if (typeof node.value === 'string') return out.push(node.value);
					break;
				case 'TemplateLiteral':
					if (node.expressions.length === 0) return out.push(node.quasis[0].value.cooked);
					break;
				case 'ConditionalExpression':
					leaves(node.consequent, out);
					return leaves(node.alternate, out);
				case 'ObjectExpression':
					return node.properties.forEach((p) => leaves(p.value ?? p, out));
				case 'MemberExpression':
					if (node.computed) return leaves(node.object, out);
					break;
				case 'CallExpression':
					if (node.callee.type === 'Identifier' && node.callee.name === '$derived')
						return leaves(node.arguments[0], out);
					break;
				case 'TSAsExpression':
				case 'TSSatisfiesExpression':
				case 'TSNonNullExpression':
					return leaves(node.expression, out);
			}
			problems.push(`${where(node)} cannot resolve \`${code(node)}\` to string literals`);
		};

		for (const script of scripts) {
			walk(script, (node) => {
				if (node.type === 'Literal' && typeof node.value === 'string' && FAMILY.test(node.value))
					problems.push(`${where(node)} ${FAMILY_ELSEWHERE}`);
				if (node.type !== 'Property' || propertyKey(node) !== 'icon') return;
				const out = [];
				leaves(node.value, out);
				for (const value of out) if (NAME.test(value)) fieldNames.add(value);
			});
		}

		const declared = (name) => {
			let init;
			for (const script of scripts)
				walk(script, (node) => {
					if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
						if (node.id.name === name) init = node.init;
				});
			return init;
		};

		const rendered = (expr) => {
			if (expr.type === 'MemberExpression' && !expr.computed && expr.property.name === 'icon') {
				readsIconField = true;
				return;
			}
			if (expr.type === 'ConditionalExpression') {
				rendered(expr.consequent);
				return rendered(expr.alternate);
			}
			let source = expr;
			if (expr.type === 'Identifier') {
				source = declared(expr.name);
				if (!source) {
					problems.push(
						`${where(expr)} \`${expr.name}\` is not a variable this component assigns a value to`
					);
					return;
				}
			}
			const out = [];
			leaves(source, out);
			for (const value of out) {
				if (NAME.test(value)) names.add(value);
				else problems.push(`${where(expr)} \`${value}\` is not an icon name`);
			}
		};

		if (!component) continue;
		for (const place of familyRules(component.css))
			problems.push(`${where(place)} ${FAMILY_ELSEWHERE}`);
		walk(component.fragment, (node) => {
			if (!Array.isArray(node.attributes)) return;
			for (const a of node.attributes)
				if (a.type === 'Attribute' || a.type === 'StyleDirective')
					if (FAMILY.test(source.slice(a.start, a.end)))
						problems.push(`${where(a)} ${FAMILY_ELSEWHERE}`);
			if (!hasIconClass(node, source)) return;
			if (node.type !== 'RegularElement') {
				problems.push(
					`${where(node)} a ${node.type} carries the icon class; put it on a plain element such as <span>`
				);
				return;
			}
			for (const child of node.fragment.nodes) {
				if (child.type === 'Comment') continue;
				if (child.type === 'Text') {
					const text = child.data.trim();
					if (!text) continue;
					if (NAME.test(text)) names.add(text);
					else problems.push(`${where(child)} \`${text}\` is not an icon name`);
				} else if (child.type === 'ExpressionTag') rendered(child.expression);
				else problems.push(`${where(child)} an icon element holds a ${child.type}`);
			}
		});
	}

	if (readsIconField) for (const name of fieldNames) names.add(name);
	if (problems.length) {
		throw new Error(
			`Icon names the font subset cannot see:\n${problems.map((p) => `  ${p}`).join('\n')}\n` +
				'Write the name as ligature text, a ternary of literals, a variable in the same component, ' +
				'or an `icon` field of an object literal.'
		);
	}
	return [...names].sort();
}

function hasIconClass(element, source) {
	return element.attributes.some(
		(a) =>
			(a.type === 'Attribute' &&
				a.name === 'class' &&
				source.slice(a.start, a.end).includes(ICON_CLASS)) ||
			(a.type === 'ClassDirective' && a.name === ICON_CLASS)
	);
}

// Declarations naming the icon family anywhere but @font-face or the class's own rule
function familyRules(css) {
	const found = [];
	const visit = (node, rule) => {
		if (node.type === 'Declaration') {
			if (FAMILY.test(node.value) && !allowsFamily(rule)) found.push(node);
			return;
		}
		for (const child of node.block?.children ?? node.children ?? []) visit(child, node);
	};
	if (css) visit(css, undefined);
	return found;
}

function allowsFamily(rule) {
	if (rule?.type === 'Atrule') return rule.name === 'font-face';
	const selectors = rule?.prelude.children;
	if (selectors?.length !== 1) return false;
	const [only] = selectors[0].children;
	return (
		selectors[0].children.length === 1 &&
		only.selectors.length === 1 &&
		only.selectors[0].type === 'ClassSelector' &&
		only.selectors[0].name === ICON_CLASS
	);
}

function propertyKey(property) {
	if (property.computed) return undefined;
	return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
	if (typeof node.type === 'string') visit(node);
	for (const key in node) if (key !== 'parent') walk(node[key], visit);
}

function lineOf(source, offset) {
	return source.slice(0, offset).split('\n').length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = fileURLToPath(new URL('..', import.meta.url));
	console.log(iconNames(readSources(root)).join(','));
}
