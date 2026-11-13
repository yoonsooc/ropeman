#!/usr/bin/env node
// The icon font is subset to these names, and a name it lacks renders as its ligature word
// ("arrow_back"), so a name this cannot resolve to string literals fails instead of being skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import tseslint from 'typescript-eslint';

const ICON_CLASS = 'material-symbols-outlined';
const NAME = /^[a-z0-9_]+$/;

/** @param {string} root */
export function readSources(root) {
	const src = path.join(root, 'src');
	return fs
		.readdirSync(src, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && /\.(svelte|ts)$/.test(e.name) && !/\.(test|d)\.ts$/.test(e.name))
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
		const component = file.path.endsWith('.svelte') ? parse(source, { modern: true }) : undefined;
		const scripts = component
			? [component.instance?.content, component.module?.content].filter(Boolean)
			: [tseslint.parser.parseForESLint(source, { range: true }).ast];
		const where = (node) => `${file.path}:${lineOf(source, node.start ?? node.range[0])}`;
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
		walk(component.fragment, (node) => {
			if (node.type !== 'RegularElement' || !hasIconClass(node, source)) return;
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
