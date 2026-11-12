import type { ASTSymbol, SymbolKind } from '$lib/types/ast';
import type { GrammarConfigLanguage } from '$lib/utils/languageDetector';

/** The part of a web-tree-sitter node the outlines read. */
export interface OutlineNode {
	type: string;
	text: string;
	startPosition: { row: number };
	endPosition: { row: number; column: number };
	hasError: boolean;
	namedChildren: OutlineNode[];
	childForFieldName(name: string): OutlineNode | null;
}

/**
 * Outlines of YAML, TOML, JSON manifests and shell scripts, read from their tree-sitter trees.
 * Names come from mapping keys, table headers and function names. A value becomes a name only
 * where the format defines it as a reference to something else (an image, an action, a package,
 * a path, a port, a Kubernetes object's kind and name), and then only when it has no
 * whitespace. Any other value (env values, Secret data, step commands, versions) is never read,
 * so the secrets these files hold cannot reach the code map, the skeleton or the AI.
 */
export const CONFIG_OUTLINES: Record<
	GrammarConfigLanguage,
	(root: OutlineNode, filePath: string) => ASTSymbol[]
> = {
	yaml: outlineYaml,
	toml: outlineToml,
	json: outlineJson,
	bash: outlineBash
};

const MAX_NAME = 200;
const REFERENCE = /^\S{1,200}$/;

const symbol = (
	name: string,
	kind: SymbolKind,
	node: OutlineNode,
	children: ASTSymbol[] = []
): ASTSymbol => {
	const sym: ASTSymbol = {
		name,
		kind,
		lineStart: node.startPosition.row + 1,
		lineEnd: lastLine(node)
	};
	if (children.length > 0) sym.children = children;
	return sym;
};

/** A node that ends with its newline (a TOML table, a YAML block) ends on the line before. */
function lastLine(node: OutlineNode): number {
	const { row, column } = node.endPosition;
	return column === 0 && row > node.startPosition.row ? row : row + 1;
}

const named = (node: OutlineNode, type: string) =>
	node.namedChildren.filter((child) => child.type === type);

const reference = (value: string | null): string | null =>
	value !== null && REFERENCE.test(value) ? value : null;

// ---------------------------------------------------------------------------------------------
// YAML

const WORKFLOW = /(?:^|\/)\.github\/workflows\/[^/]+$/;
const COMPOSE = /(?:^|\/)(?:docker-)?compose(?:[.-][^/]*)?\.ya?ml$/;
const CONTAINER_LISTS = new Set(['containers', 'initContainers', 'ephemeralContainers']);
const SECRET_DATA = new Set(['data', 'stringData', 'binaryData']);

/**
 * Per document: a Kubernetes object (`apiVersion` and `kind` at the top) is one `resource`
 * named `Kind/name`, with its container images as imports and the keys of its `data` as
 * children. Any other document gives its top-level keys. A GitHub Actions workflow's `jobs`
 * key holds a `job` per job with the actions it `uses` and its env keys, and its `env` key
 * holds the workflow's env keys; a Compose file's `services` key holds
 * a `service` per service with its image, build context, ports, `depends_on` and env keys.
 */
function outlineYaml(root: OutlineNode, filePath: string): ASTSymbol[] {
	const expand: YamlExpanders = WORKFLOW.test(filePath)
		? { jobs: workflowJobs, env: (value) => yamlKeys(value, 'env') }
		: COMPOSE.test(filePath)
			? { services: composeServices }
			: {};
	const symbols: ASTSymbol[] = [];
	// A document with a syntax error is skipped whole: recovery can read a broken value as a key
	for (const doc of named(root, 'document').filter((d) => !d.hasError)) {
		const top = doc.namedChildren.find((c) => c.type === 'block_node' || c.type === 'flow_node');
		const mapping = top && yamlMapping(top);
		if (!mapping) continue;
		const pairs = yamlPairs(mapping);
		const resource = kubernetesResource(mapping, pairs);
		if (resource) {
			symbols.push(resource);
			continue;
		}
		for (const [key, pair] of pairs) {
			const value = pair.childForFieldName('value');
			const children = value ? expand[key]?.(value) : undefined;
			symbols.push(symbol(key, 'key', pair, children));
		}
	}
	return symbols;
}

type YamlExpanders = Partial<Record<string, (value: OutlineNode) => ASTSymbol[]>>;

/** The mapping a block or flow node holds, past any anchor or tag. */
function yamlMapping(node: OutlineNode): OutlineNode | null {
	return (
		node.namedChildren.find((c) => c.type === 'block_mapping' || c.type === 'flow_mapping') ?? null
	);
}

function yamlSequence(node: OutlineNode): OutlineNode[] {
	const seq = node.namedChildren.find(
		(c) => c.type === 'block_sequence' || c.type === 'flow_sequence'
	);
	if (!seq) return [];
	if (seq.type === 'flow_sequence') return named(seq, 'flow_node');
	return named(seq, 'block_sequence_item').flatMap((item) => item.namedChildren.slice(0, 1));
}

/** Each pair with a plain or quoted scalar key, as `[key, pair]`; complex keys are skipped. */
function yamlPairs(mapping: OutlineNode): [string, OutlineNode][] {
	const pairs: [string, OutlineNode][] = [];
	for (const pair of mapping.namedChildren) {
		if (pair.type !== 'block_mapping_pair' && pair.type !== 'flow_pair') continue;
		const key = pair.childForFieldName('key');
		const name = key && yamlScalar(key);
		if (name && name !== '<<') pairs.push([name, pair]);
	}
	return pairs;
}

// Block scalars (`|`, `>`) are multi-line text, never a name
const YAML_SCALARS = new Set(['plain_scalar', 'double_quote_scalar', 'single_quote_scalar']);

function yamlScalar(node: OutlineNode): string | null {
	const scalar = node.namedChildren.find((c) => YAML_SCALARS.has(c.type));
	if (!scalar) return null;
	const text = scalar.type === 'plain_scalar' ? scalar.text : scalar.text.slice(1, -1);
	return text && text.length <= MAX_NAME && !text.includes('\n') ? text : null;
}

function yamlValue(pairs: [string, OutlineNode][], key: string): OutlineNode | null {
	return pairs.find(([name]) => name === key)?.[1].childForFieldName('value') ?? null;
}

function yamlValueScalar(pairs: [string, OutlineNode][], key: string): string | null {
	const value = yamlValue(pairs, key);
	return value && yamlScalar(value);
}

function yamlKeys(value: OutlineNode, kind: SymbolKind): ASTSymbol[] {
	const mapping = yamlMapping(value);
	return mapping ? yamlPairs(mapping).map(([key, pair]) => symbol(key, kind, pair)) : [];
}

function kubernetesResource(
	mapping: OutlineNode,
	pairs: [string, OutlineNode][]
): ASTSymbol | null {
	const kind = reference(yamlValueScalar(pairs, 'kind'));
	if (!kind || !yamlValue(pairs, 'apiVersion')) return null;
	const metadata = yamlValue(pairs, 'metadata');
	const metadataMapping = metadata && yamlMapping(metadata);
	const name = metadataMapping && reference(yamlValueScalar(yamlPairs(metadataMapping), 'name'));
	const children = [
		...containerImages(mapping),
		...pairs
			.filter(([key]) => SECRET_DATA.has(key))
			.flatMap(([, pair]) => {
				const value = pair.childForFieldName('value');
				return value ? yamlKeys(value, 'key') : [];
			})
	];
	return symbol(name ? `${kind}/${name}` : kind, 'resource', mapping, children);
}

/** The `image` of every container in a pod template, at any depth. */
function containerImages(mapping: OutlineNode): ASTSymbol[] {
	const images: ASTSymbol[] = [];
	for (const [key, pair] of yamlPairs(mapping)) {
		const value = pair.childForFieldName('value');
		if (!value) continue;
		if (CONTAINER_LISTS.has(key)) {
			for (const item of yamlSequence(value)) {
				const container = yamlMapping(item);
				const image = container && yamlPairs(container).find(([k]) => k === 'image');
				const name = image && reference(yamlValueScalar([image], 'image'));
				if (image && name) images.push(symbol(name, 'import', image[1]));
			}
			continue;
		}
		const inner = yamlMapping(value);
		if (inner) images.push(...containerImages(inner));
	}
	return images;
}

function workflowJobs(value: OutlineNode): ASTSymbol[] {
	const jobs = yamlMapping(value);
	if (!jobs) return [];
	return yamlPairs(jobs).map(([id, pair]) => {
		const body = pair.childForFieldName('value');
		const job = body && yamlMapping(body);
		const children: ASTSymbol[] = [];
		if (job) {
			const jobPairs = yamlPairs(job);
			children.push(...usesOf(jobPairs));
			const env = yamlValue(jobPairs, 'env');
			if (env) children.push(...yamlKeys(env, 'env'));
			const steps = yamlValue(jobPairs, 'steps');
			for (const step of steps ? yamlSequence(steps) : []) {
				const stepMapping = yamlMapping(step);
				if (stepMapping) children.push(...usesOf(yamlPairs(stepMapping)));
			}
		}
		return symbol(id, 'job', pair, children);
	});
}

function usesOf(pairs: [string, OutlineNode][]): ASTSymbol[] {
	const pair = pairs.find(([key]) => key === 'uses');
	const action = pair && reference(yamlValueScalar([pair], 'uses'));
	return pair && action ? [symbol(action, 'import', pair[1])] : [];
}

/**
 * Environment keys come from the mapping form only: in the list form (`- KEY=value`) the key
 * and its value are one scalar, and a value is never split into a name.
 */
function composeServices(value: OutlineNode): ASTSymbol[] {
	const services = yamlMapping(value);
	if (!services) return [];
	return yamlPairs(services).map(([name, pair]) => {
		const body = pair.childForFieldName('value');
		const service = body && yamlMapping(body);
		return symbol(name, 'service', pair, service ? composeService(yamlPairs(service)) : []);
	});
}

function composeService(pairs: [string, OutlineNode][]): ASTSymbol[] {
	const children: ASTSymbol[] = [];
	for (const [key, pair] of pairs) {
		const value = pair.childForFieldName('value');
		if (!value) continue;
		if (key === 'image' || key === 'build') {
			const context = key === 'build' ? buildContext(value) : yamlScalar(value);
			const name = reference(context);
			if (name) children.push(symbol(name, 'import', pair));
		} else if (key === 'ports') {
			for (const item of yamlSequence(value)) {
				const port = reference(composePort(item));
				if (port) children.push(symbol(port, 'port', item));
			}
		} else if (key === 'depends_on') {
			for (const item of yamlSequence(value)) {
				const service = reference(yamlScalar(item));
				if (service) children.push(symbol(service, 'import', item));
			}
			children.push(...yamlKeys(value, 'import'));
		} else if (key === 'environment') {
			children.push(...yamlKeys(value, 'env'));
		}
	}
	return children;
}

function buildContext(value: OutlineNode): string | null {
	const mapping = yamlMapping(value);
	return mapping ? yamlValueScalar(yamlPairs(mapping), 'context') : yamlScalar(value);
}

/** `8080:80` as written, or `published:target` from the long syntax. */
function composePort(item: OutlineNode): string | null {
	const mapping = yamlMapping(item);
	if (!mapping) return yamlScalar(item);
	const pairs = yamlPairs(mapping);
	const target = yamlValueScalar(pairs, 'target');
	const published = yamlValueScalar(pairs, 'published');
	return target && (published ? `${published}:${target}` : target);
}

// ---------------------------------------------------------------------------------------------
// TOML

const DEPENDENCY_TABLE =
	/^(?:dev-|build-)?dependencies$|^optional-dependencies$|^dependency-groups$/;
const SCRIPT_TABLE = /^(?:gui-)?scripts$/;
const REQUIREMENT_LIST = new Set(['dependencies', 'requires']);
// The distribution name a PEP 508 requirement starts with; the version, extras and URL after it
// are never read, so an index URL with a token in it stays out
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/;

/**
 * Top-level keys, then each `[table]` and `[[array of tables]]` by its header. A dependency
 * table (`[tool.poetry.dependencies]`, Cargo's `[dependencies]`) imports each key, and an array
 * of PEP 508 requirements (`[project] dependencies`, `[build-system] requires`, the lists in
 * `[project.optional-dependencies]`) imports each package name. A scripts table gives a
 * `target` per entry point.
 */
function outlineToml(root: OutlineNode): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];
	for (const node of root.namedChildren) {
		if (node.type === 'pair') {
			const key = tomlKey(node);
			if (key) symbols.push(symbol(key, 'key', node));
		} else if (node.type === 'table' || node.type === 'table_array_element') {
			const header = node.namedChildren[0];
			const name = header && tomlKeyText(header);
			if (name) symbols.push(symbol(name, 'table', node, tomlTableChildren(name, node)));
		}
	}
	return symbols;
}

function tomlTableChildren(name: string, table: OutlineNode): ASTSymbol[] {
	const last = name.slice(name.lastIndexOf('.') + 1);
	const dependencyTable = DEPENDENCY_TABLE.test(last);
	const children: ASTSymbol[] = [];
	for (const pair of named(table, 'pair')) {
		const key = tomlKey(pair);
		if (!key) continue;
		const value = pair.namedChildren[pair.namedChildren.length - 1];
		if (value?.type === 'array' && (dependencyTable || REQUIREMENT_LIST.has(key))) {
			children.push(...requirements(value));
		} else if (dependencyTable) {
			children.push(symbol(key, 'import', pair));
		} else if (SCRIPT_TABLE.test(last)) {
			children.push(symbol(key, 'target', pair));
		}
	}
	return children;
}

function requirements(array: OutlineNode): ASTSymbol[] {
	return named(array, 'string').flatMap((item) => {
		const name = item.text.replace(/^(?:"""|'''|"|')/, '').match(REQUIREMENT_NAME)?.[1];
		return name ? [symbol(name, 'import', item)] : [];
	});
}

function tomlKey(pair: OutlineNode): string | null {
	const key = pair.namedChildren[0];
	return key ? tomlKeyText(key) : null;
}

function tomlKeyText(key: OutlineNode): string | null {
	if (key.type === 'bare_key') return key.text;
	if (key.type === 'quoted_key') return key.text.slice(1, -1);
	if (key.type !== 'dotted_key') return null;
	const parts = key.namedChildren.map(tomlKeyText);
	return parts.every((part) => part !== null) ? parts.join('.') : null;
}

// ---------------------------------------------------------------------------------------------
// JSON

const JSON_DEPENDENCY_KEYS = new Set([
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
	'require',
	'require-dev'
]);

/**
 * The top-level keys of a manifest (`package.json`, `composer.json`, `tsconfig*.json`). Its
 * dependency objects import each package, `scripts` gives a `target` per script, and a
 * tsconfig's `extends` and `references` import the configs they point at.
 */
function outlineJson(root: OutlineNode): ASTSymbol[] {
	const object = root.namedChildren.find((c) => c.type === 'object');
	if (!object) return [];
	return jsonPairs(object).map(([key, pair]) => {
		const value = pair.childForFieldName('value');
		return symbol(key, 'key', pair, value ? jsonChildren(key, value) : []);
	});
}

function jsonChildren(key: string, value: OutlineNode): ASTSymbol[] {
	if (JSON_DEPENDENCY_KEYS.has(key) || key === 'scripts') {
		if (value.type !== 'object') return [];
		const kind = key === 'scripts' ? 'target' : 'import';
		return jsonPairs(value).map(([name, pair]) => symbol(name, kind, pair));
	}
	if (key === 'extends') {
		const items = value.type === 'array' ? value.namedChildren : [value];
		return items.flatMap((item) => jsonReference(item));
	}
	if (key === 'references' && value.type === 'array') {
		return named(value, 'object').flatMap((ref) => {
			const path = jsonPairs(ref).find(([name]) => name === 'path');
			const target = path?.[1].childForFieldName('value');
			return target ? jsonReference(target) : [];
		});
	}
	return [];
}

function jsonReference(node: OutlineNode): ASTSymbol[] {
	const name = reference(jsonString(node));
	return name ? [symbol(name, 'import', node)] : [];
}

function jsonPairs(object: OutlineNode): [string, OutlineNode][] {
	const pairs: [string, OutlineNode][] = [];
	for (const pair of named(object, 'pair')) {
		const key = pair.childForFieldName('key');
		const name = key && jsonString(key);
		if (name) pairs.push([name, pair]);
	}
	return pairs;
}

function jsonString(node: OutlineNode): string | null {
	if (node.type !== 'string') return null;
	const text = node.text.slice(1, -1);
	return text.length <= MAX_NAME ? text : null;
}

// ---------------------------------------------------------------------------------------------
// Bash

const SOURCE_COMMANDS = new Set(['source', '.']);
const SUBSTITUTION = /command_substitution|process_substitution/;

/**
 * Top-level functions, and every `source x.sh` or `. x.sh` as an import named by the command
 * and its first argument. Commands and the scripts they run are refs (refQueries.ts).
 */
function outlineBash(root: OutlineNode): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];
	for (const node of root.namedChildren) {
		if (node.type !== 'function_definition') continue;
		const name = node.childForFieldName('name')?.text;
		if (name) symbols.push(symbol(name, 'function', node));
	}
	collectSources(root, symbols);
	return symbols.sort((a, b) => a.lineStart - b.lineStart);
}

function collectSources(node: OutlineNode, out: ASTSymbol[]): void {
	for (const child of node.namedChildren) {
		if (child.type === 'command') {
			const command = child.childForFieldName('name')?.text;
			const path = child.childForFieldName('argument');
			if (command && SOURCE_COMMANDS.has(command) && path && !hasSubstitution(path)) {
				const name = reference(path.text);
				if (name) out.push(symbol(`${command} ${name}`, 'import', child));
			}
		}
		collectSources(child, out);
	}
}

function hasSubstitution(node: OutlineNode): boolean {
	return SUBSTITUTION.test(node.type) || node.namedChildren.some(hasSubstitution);
}
