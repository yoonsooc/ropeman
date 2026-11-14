import { Language, Parser, Query } from 'web-tree-sitter';
import type { ASTRef, ASTSymbol, BadgeKind, SymbolKind } from '$lib/types/ast';
import { getGrammarFile, isGrammarConfigLanguage } from '$lib/utils/languageDetector';
import { componentScriptSource, isComponentLanguage } from '$lib/utils/sfcScripts';
import { extractRefs } from './refQueries';
import { CONFIG_OUTLINES, type OutlineNode } from './configOutline';

/** What the parser read from one file. Line parsers record no reference sites. */
export interface ParsedFile {
	symbols: ASTSymbol[];
	refs: ASTRef[];
}

/** Reads one file with its tree-sitter grammar. Throws when it has none or reads nothing. */
export type GrammarParse = (
	filePath: string,
	content: string,
	language: string
) => Promise<ParsedFile>;

/**
 * The tree-sitter reader the Web Worker and the Node extractor share. `wasmUrl` maps a
 * `.wasm` file name to where it loads from: a URL under /static in the browser, a file
 * path in Node.
 */
export async function createGrammarParser(
	wasmUrl: (file: string) => string
): Promise<GrammarParse> {
	await Parser.init({ locateFile: () => wasmUrl('tree-sitter.wasm') });
	const parser = new Parser();
	const grammars = new Map<string, Language>();
	const grammarFor = async (file: string) => {
		const cached = grammars.get(file);
		if (cached) return cached;
		const grammar = await Language.load(wasmUrl(file));
		grammars.set(file, grammar);
		return grammar;
	};

	return async (filePath, content, language) => {
		const source = isComponentLanguage(language)
			? componentScriptSource(filePath, content)
			: { filePath, content, language };
		const grammarFile = getGrammarFile(source.language, source.filePath);
		if (!grammarFile) throw new Error(`Unsupported language: ${source.language}`);
		const grammar = await grammarFor(grammarFile);
		parser.setLanguage(grammar);

		const tree = parser.parse(source.content);
		if (!tree) throw new Error('parser returned no tree');
		try {
			const symbols = isGrammarConfigLanguage(source.language)
				? // web-tree-sitter types child lists as nullable; a parsed tree never holds a null child
					CONFIG_OUTLINES[source.language](tree.rootNode as unknown as OutlineNode, source.filePath)
				: extractSymbols(tree.rootNode, source.language);
			// tree-sitter recovers from any syntax error, so a broken file would otherwise read as
			// a valid file without definitions
			if (symbols.length === 0 && tree.rootNode.hasError) {
				throw new Error('syntax errors and no symbols');
			}
			const refs = extractRefs(
				tree.rootNode,
				source.content,
				grammarFile,
				(query) => new Query(grammar, query)
			);
			return { symbols, refs };
		} finally {
			// Trees live in the WASM heap; kept, they exhaust it after about 10,000 files
			tree.delete();
		}
	};
}

function extractSymbols(rootNode: any, language: string): ASTSymbol[] {
	switch (language) {
		case 'python':
			return extractPythonSymbols(rootNode);
		case 'javascript':
		case 'typescript':
			return extractJSSymbols(rootNode);
		case 'go':
			return extractGoSymbols(rootNode);
		case 'rust':
		case 'java':
		case 'c':
		case 'cpp':
		case 'ruby':
		case 'php':
		case 'swift':
		case 'kotlin':
		case 'csharp':
		case 'scala':
			return extractGenericSymbols(rootNode, language);
		default:
			return extractGenericSymbols(rootNode, language);
	}
}

function extractPythonSymbols(rootNode: any): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];

	for (const child of rootNode.children) {
		if (child.type === 'function_definition') {
			symbols.push(buildFunctionSymbol(child, 'function', 'python'));
		} else if (child.type === 'class_definition') {
			symbols.push(buildClassSymbol(child, 'python'));
		} else if (child.type === 'import_statement' || child.type === 'import_from_statement') {
			symbols.push(buildImportSymbol(child));
		} else if (child.type === 'decorated_definition') {
			const inner = child.children.find(
				(c: any) => c.type === 'function_definition' || c.type === 'class_definition'
			);
			if (inner) {
				if (inner.type === 'function_definition') {
					symbols.push(buildFunctionSymbol(inner, 'function', 'python'));
				} else {
					symbols.push(buildClassSymbol(inner, 'python'));
				}
			}
		}
	}

	return symbols;
}

function extractJSSymbols(rootNode: any): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];

	for (const child of rootNode.children) {
		if (child.type === 'function_declaration') {
			symbols.push(buildFunctionSymbol(child, 'function', 'javascript'));
		} else if (child.type === 'class_declaration') {
			symbols.push(buildClassSymbol(child, 'javascript'));
		} else if (child.type === 'import_statement') {
			symbols.push(buildImportSymbol(child));
		} else if (child.type === 'export_statement') {
			const isDefault = child.text?.startsWith('export default');
			const inner = child.children.find(
				(c: any) =>
					c.type === 'function_declaration' ||
					c.type === 'class_declaration' ||
					c.type === 'lexical_declaration'
			);
			if (inner) {
				if (inner.type === 'function_declaration') {
					const sym = buildFunctionSymbol(inner, 'function', 'javascript');
					if (isDefault) {
						sym.badges = [...(sym.badges ?? []), 'export_default'];
					}
					symbols.push(sym);
				} else if (inner.type === 'class_declaration') {
					const sym = buildClassSymbol(inner, 'javascript');
					if (isDefault) {
						sym.badges = [...(sym.badges ?? []), 'export_default'];
					}
					symbols.push(sym);
				} else if (inner.type === 'lexical_declaration') {
					const arrowSyms = extractArrowFunctions(inner);
					if (isDefault) {
						for (const s of arrowSyms) {
							s.badges = [...(s.badges ?? []), 'export_default'];
						}
					}
					symbols.push(...arrowSyms);
				}
			}
		} else if (child.type === 'lexical_declaration') {
			const arrowSyms = extractArrowFunctions(child);
			symbols.push(...arrowSyms);
		}
	}

	return symbols;
}

function extractGoSymbols(rootNode: any): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];

	for (const child of rootNode.children) {
		if (child.type === 'package_clause') {
			symbols.push({
				name: child.childForFieldName('name')?.text ?? child.text,
				kind: 'import',
				lineStart: child.startPosition.row + 1,
				lineEnd: child.endPosition.row + 1
			});
		} else if (child.type === 'import_declaration') {
			// A grouped `import ( … )` holds one import per spec, and a site names one package
			const list = child.children.find((c: any) => c.type === 'import_spec_list');
			if (!list) symbols.push(buildImportSymbol(child));
			else
				for (const spec of list.children.filter((c: any) => c.type === 'import_spec'))
					symbols.push(buildImportSymbol(spec));
		} else if (child.type === 'function_declaration') {
			symbols.push(buildFunctionSymbol(child, 'function', 'go'));
		} else if (child.type === 'method_declaration') {
			// Go methods: func (receiver Type) MethodName(...)
			const nameNode = child.childForFieldName('name');
			const receiverNode = child.childForFieldName('receiver');
			let receiverType: string | undefined;
			if (receiverNode) {
				// Extract the type name from the parameter list
				const paramList = receiverNode.text ?? '';
				const match = paramList.match(/\*?(\w+)\s*\)$/);
				if (match) receiverType = match[1];
			}
			symbols.push({
				name: nameNode?.text ?? '<anonymous>',
				kind: 'method',
				lineStart: child.startPosition.row + 1,
				lineEnd: child.endPosition.row + 1,
				parentName: receiverType
			});
		} else if (child.type === 'type_declaration') {
			// type_declaration contains type_spec children
			for (const spec of child.children) {
				if (spec.type === 'type_spec') {
					const nameNode = spec.childForFieldName('name');
					const typeNode = spec.childForFieldName('type');
					const typeName = typeNode?.type;

					if (typeName === 'struct_type') {
						const methods: ASTSymbol[] = [];
						const body = typeNode.childForFieldName('body') ?? typeNode;
						if (body) {
							for (const field of body.children) {
								if (field.type === 'field_declaration') {
									const fieldName = field.childForFieldName('name');
									if (fieldName) {
										methods.push({
											name: fieldName.text,
											kind: 'variable',
											lineStart: field.startPosition.row + 1,
											lineEnd: field.endPosition.row + 1,
											parentName: nameNode?.text
										});
									}
								}
							}
						}
						symbols.push({
							name: nameNode?.text ?? '<anonymous>',
							kind: 'class',
							lineStart: child.startPosition.row + 1,
							lineEnd: child.endPosition.row + 1,
							children: methods.length > 0 ? methods : undefined
						});
					} else if (typeName === 'interface_type') {
						const methods: ASTSymbol[] = [];
						for (const member of typeNode.children) {
							if (member.type === 'method_spec') {
								const methodName = member.childForFieldName('name');
								methods.push({
									name: methodName?.text ?? '<anonymous>',
									kind: 'method',
									lineStart: member.startPosition.row + 1,
									lineEnd: member.endPosition.row + 1,
									parentName: nameNode?.text
								});
							}
						}
						symbols.push({
							name: nameNode?.text ?? '<anonymous>',
							kind: 'interface',
							lineStart: child.startPosition.row + 1,
							lineEnd: child.endPosition.row + 1,
							children: methods.length > 0 ? methods : undefined
						});
					} else {
						// type alias
						symbols.push({
							name: nameNode?.text ?? '<anonymous>',
							kind: 'type',
							lineStart: child.startPosition.row + 1,
							lineEnd: child.endPosition.row + 1
						});
					}
				}
			}
		}
	}

	return symbols;
}

function extractGenericSymbols(rootNode: any, language: string): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];

	function walk(node: any) {
		switch (node.type) {
			// Functions
			case 'function_definition':
			case 'function_declaration':
			case 'function_item': {
				symbols.push(buildFunctionSymbol(node, 'function', language));
				return; // don't walk children
			}

			// Methods (Java)
			case 'method_declaration': {
				// Java method inside a class
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'method',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Classes (Java, C++)
			case 'class_declaration': {
				symbols.push(buildClassSymbol(node, language));
				return;
			}

			// Structs (Rust)
			case 'struct_item': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Enums (Rust)
			case 'enum_item': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Impl blocks (Rust)
			case 'impl_item': {
				const typeNode = node.childForFieldName('type');
				const traitNode = node.childForFieldName('trait');
				const implName = traitNode
					? `${traitNode.text} for ${typeNode?.text ?? '?'}`
					: (typeNode?.text ?? '<anonymous>');
				const methods: ASTSymbol[] = [];
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						if (member.type === 'function_item') {
							const methodName = member.childForFieldName('name');
							methods.push({
								name: methodName?.text ?? '<anonymous>',
								kind: 'method',
								lineStart: member.startPosition.row + 1,
								lineEnd: member.endPosition.row + 1,
								parentName: typeNode?.text
							});
						}
					}
				}
				symbols.push({
					name: implName,
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1,
					children: methods.length > 0 ? methods : undefined
				});
				return;
			}

			// Interfaces (Java)
			case 'interface_declaration': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'interface',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Imports
			case 'import_declaration':
			case 'use_declaration':
			case 'preproc_include': {
				symbols.push(buildImportSymbol(node));
				return;
			}

			// Rust trait → interface with method signatures
			case 'trait_item': {
				const nameNode = node.childForFieldName('name');
				const methods: ASTSymbol[] = [];
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						if (member.type === 'function_item' || member.type === 'function_signature_item') {
							const methodName = member.childForFieldName('name');
							methods.push({
								name: methodName?.text ?? '<anonymous>',
								kind: 'method',
								lineStart: member.startPosition.row + 1,
								lineEnd: member.endPosition.row + 1,
								parentName: nameNode?.text
							});
						}
					}
				}
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'interface',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1,
					children: methods.length > 0 ? methods : undefined
				});
				return;
			}

			// C/C++ struct
			case 'struct_specifier': {
				const nameNode = node.childForFieldName('name');
				if (!nameNode) break; // skip anonymous structs, walk children
				const members: ASTSymbol[] = [];
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						if (member.type === 'field_declaration') {
							const declarator = member.childForFieldName('declarator');
							if (declarator) {
								members.push({
									name: declarator.text,
									kind: 'variable',
									lineStart: member.startPosition.row + 1,
									lineEnd: member.endPosition.row + 1,
									parentName: nameNode.text
								});
							}
						} else if (member.type === 'function_definition') {
							const declarator = member.childForFieldName('declarator');
							members.push({
								name: declarator?.text ?? '<anonymous>',
								kind: 'method',
								lineStart: member.startPosition.row + 1,
								lineEnd: member.endPosition.row + 1,
								parentName: nameNode.text
							});
						}
					}
				}
				symbols.push({
					name: nameNode.text,
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1,
					children: members.length > 0 ? members : undefined
				});
				return;
			}

			// C/C++ enum
			case 'enum_specifier': {
				const nameNode = node.childForFieldName('name');
				if (!nameNode) break; // skip anonymous enums
				symbols.push({
					name: nameNode.text,
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// C++ class
			case 'class_specifier': {
				const nameNode = node.childForFieldName('name');
				if (!nameNode) break; // skip anonymous classes
				const methods: ASTSymbol[] = [];
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						if (member.type === 'function_definition') {
							const declarator = member.childForFieldName('declarator');
							methods.push({
								name: declarator?.text ?? '<anonymous>',
								kind: 'method',
								lineStart: member.startPosition.row + 1,
								lineEnd: member.endPosition.row + 1,
								parentName: nameNode.text
							});
						} else if (member.type === 'declaration') {
							const declarator = member.childForFieldName('declarator');
							if (declarator?.type === 'function_declarator') {
								const funcName = declarator.childForFieldName('declarator');
								methods.push({
									name: funcName?.text ?? declarator.text,
									kind: 'method',
									lineStart: member.startPosition.row + 1,
									lineEnd: member.endPosition.row + 1,
									parentName: nameNode.text
								});
							}
						}
					}
				}
				symbols.push({
					name: nameNode.text,
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1,
					children: methods.length > 0 ? methods : undefined
				});
				return;
			}

			// C++ namespace — walk into body, don't add as symbol
			case 'namespace_definition': {
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						walk(member);
					}
				}
				return;
			}

			// Java enum
			case 'enum_declaration': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'class',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Java constructor
			case 'constructor_declaration': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<constructor>',
					kind: 'method',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Java package
			case 'package_declaration': {
				symbols.push(buildImportSymbol(node));
				return;
			}

			// C typedef (e.g., typedef struct { ... } TypeName;)
			case 'type_definition': {
				const declarator = node.childForFieldName('declarator');
				const typeChild = node.childForFieldName('type');
				if (
					declarator &&
					(typeChild?.type === 'struct_specifier' || typeChild?.type === 'enum_specifier')
				) {
					symbols.push({
						name: declarator.text,
						kind: 'class',
						lineStart: node.startPosition.row + 1,
						lineEnd: node.endPosition.row + 1
					});
					return;
				}
				break;
			}

			// --- Tier 2 language support ---

			// Ruby: bare 'method' and 'singleton_method' nodes
			case 'method':
			case 'singleton_method': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'method',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Ruby: bare 'class' node type
			case 'class': {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					const methods: ASTSymbol[] = [];
					const body = node.childForFieldName('body');
					if (body) {
						for (const member of body.children) {
							if (member.type === 'method' || member.type === 'singleton_method') {
								const methodName = member.childForFieldName('name');
								methods.push({
									name: methodName?.text ?? '<anonymous>',
									kind: 'method',
									lineStart: member.startPosition.row + 1,
									lineEnd: member.endPosition.row + 1,
									parentName: nameNode.text
								});
							}
						}
					}
					symbols.push({
						name: nameNode.text,
						kind: 'class',
						lineStart: node.startPosition.row + 1,
						lineEnd: node.endPosition.row + 1,
						children: methods.length > 0 ? methods : undefined
					});
					return;
				}
				break;
			}

			// Ruby: module — treated as class-like container
			case 'module': {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					const methods: ASTSymbol[] = [];
					const body = node.childForFieldName('body');
					if (body) {
						for (const member of body.children) {
							if (member.type === 'method' || member.type === 'singleton_method') {
								const methodName = member.childForFieldName('name');
								methods.push({
									name: methodName?.text ?? '<anonymous>',
									kind: 'method',
									lineStart: member.startPosition.row + 1,
									lineEnd: member.endPosition.row + 1,
									parentName: nameNode.text
								});
							}
						}
					}
					symbols.push({
						name: nameNode.text,
						kind: 'class',
						lineStart: node.startPosition.row + 1,
						lineEnd: node.endPosition.row + 1,
						children: methods.length > 0 ? methods : undefined
					});
					return;
				}
				break;
			}

			// PHP namespace_use_declaration → import
			case 'namespace_use_declaration': {
				symbols.push(buildImportSymbol(node));
				return;
			}

			// PHP trait → interface-like
			case 'trait_declaration': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'interface',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// Kotlin object_declaration
			case 'object_declaration': {
				if (nameNodeOf(node)) {
					symbols.push(buildClassSymbol(node, language));
					return;
				}
				break;
			}

			// Scala object_definition, trait_definition
			case 'object_definition':
			case 'trait_definition': {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					const kind = node.type === 'trait_definition' ? 'interface' : 'class';
					symbols.push({
						name: nameNode.text,
						kind: kind as SymbolKind,
						lineStart: node.startPosition.row + 1,
						lineEnd: node.endPosition.row + 1
					});
					return;
				}
				break;
			}

			// Swift protocol → interface
			case 'protocol_declaration': {
				const nameNode = node.childForFieldName('name');
				symbols.push({
					name: nameNode?.text ?? '<anonymous>',
					kind: 'interface',
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}

			// C# struct_declaration
			case 'struct_declaration': {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					symbols.push({
						name: nameNode.text,
						kind: 'class',
						lineStart: node.startPosition.row + 1,
						lineEnd: node.endPosition.row + 1
					});
					return;
				}
				break;
			}

			// C# namespace_declaration — walk into body
			case 'namespace_declaration': {
				const body = node.childForFieldName('body');
				if (body) {
					for (const member of body.children) {
						walk(member);
					}
				}
				return;
			}

			// C# using_directive → import
			case 'using_directive': {
				symbols.push(buildImportSymbol(node));
				return;
			}

			// Kotlin/Swift/Ruby import_statement
			case 'import_statement': {
				symbols.push(buildImportSymbol(node));
				return;
			}
		}

		// Generic heuristic fallback: catch unhandled *_definition/*_declaration nodes
		// This enables basic symbol extraction for any tree-sitter grammar
		const nodeType = node.type;
		if (
			!nodeType.startsWith('field_') &&
			!nodeType.startsWith('variable_') &&
			!nodeType.startsWith('lexical_') &&
			(nodeType.endsWith('_definition') ||
				nodeType.endsWith('_declaration') ||
				nodeType.endsWith('_item'))
		) {
			const nameNode = node.childForFieldName('name');
			if (nameNode) {
				let kind: SymbolKind = 'function';
				if (
					nodeType.includes('class') ||
					nodeType.includes('struct') ||
					nodeType.includes('enum')
				) {
					kind = 'class';
				} else if (
					nodeType.includes('interface') ||
					nodeType.includes('trait') ||
					nodeType.includes('protocol')
				) {
					kind = 'interface';
				} else if (
					nodeType.includes('import') ||
					nodeType.includes('use') ||
					nodeType.includes('include')
				) {
					kind = 'import';
				}
				symbols.push({
					name: nameNode.text,
					kind,
					lineStart: node.startPosition.row + 1,
					lineEnd: node.endPosition.row + 1
				});
				return;
			}
		}

		// Walk children for container nodes
		if (node.children) {
			for (const child of node.children) {
				walk(child);
			}
		}
	}

	walk(rootNode);
	return symbols;
}

function extractArrowFunctions(node: any): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];

	for (const declarator of node.children) {
		if (declarator.type !== 'variable_declarator') continue;

		const nameNode = declarator.childForFieldName('name');
		const valueNode = declarator.childForFieldName('value');

		if (valueNode?.type === 'arrow_function' && nameNode) {
			symbols.push({
				name: nameNode.text,
				kind: 'function',
				lineStart: node.startPosition.row + 1,
				lineEnd: node.endPosition.row + 1
			});
		}
	}

	return symbols;
}

function detectBadges(node: any, language: string): BadgeKind[] {
	const badges: BadgeKind[] = [];

	if (language === 'python') {
		// Check for async def
		if (node.type === 'function_definition' && node.text?.startsWith('async ')) {
			badges.push('async');
		}
		// Check for yield in body (generator)
		const body = node.childForFieldName('body');
		if (body && body.text?.includes('yield')) {
			badges.push('generator');
		}
		// Check for @staticmethod decorator (look at parent decorated_definition)
		const parentText = node.parent?.text ?? '';
		if (parentText.includes('@staticmethod')) {
			badges.push('static');
		}
		// Check for route decorators
		if (parentText.match(/@(app|router)\.(route|get|post|put|delete|patch)/)) {
			badges.push('route');
		}
		// Check if decorated
		if (node.parent?.type === 'decorated_definition') {
			badges.push('decorator');
		}
	} else {
		// JS/TS
		// async function or async arrow
		if (node.text?.startsWith('async ')) {
			badges.push('async');
		}
		// generator: function*
		if (node.type === 'generator_function_declaration' || node.text?.includes('function*')) {
			badges.push('generator');
		}
		// abstract class
		if (node.text?.startsWith('abstract ')) {
			badges.push('abstract');
		}
	}

	return badges;
}

/**
 * The name of a declaration. C and C++ name a function inside its declarator
 * (`int *run(void)`), and the Kotlin grammar has no field names, so both fall back to the node
 * that holds the identifier.
 */
function nameNodeOf(node: any): any {
	const named = node.childForFieldName('name');
	if (named) return named;
	let declarator = node.childForFieldName('declarator');
	while (declarator?.childForFieldName('declarator')) {
		declarator = declarator.childForFieldName('declarator');
	}
	if (declarator) return declarator;
	return node.namedChildren?.find(
		(c: any) => c.type === 'simple_identifier' || c.type === 'type_identifier'
	);
}

function buildFunctionSymbol(node: any, kind: SymbolKind, language: string = 'python'): ASTSymbol {
	const nameNode = nameNodeOf(node);
	const badges = detectBadges(node, language);
	return {
		name: nameNode?.text ?? '<anonymous>',
		kind,
		lineStart: node.startPosition.row + 1,
		lineEnd: node.endPosition.row + 1,
		badges: badges.length > 0 ? badges : undefined
	};
}

function buildClassSymbol(node: any, language: string = 'python'): ASTSymbol {
	const nameNode = nameNodeOf(node);
	const methods: ASTSymbol[] = [];
	const badges = detectBadges(node, language);

	const body =
		node.childForFieldName('body') ?? node.namedChildren?.find((c: any) => c.type === 'class_body');
	if (body) {
		for (const member of body.children) {
			if (
				member.type === 'function_definition' ||
				member.type === 'method_definition' ||
				member.type === 'method_declaration' ||
				// Kotlin
				member.type === 'function_declaration'
			) {
				const methodName = nameNodeOf(member);
				methods.push({
					name: methodName?.text ?? '<anonymous>',
					kind: 'method',
					lineStart: member.startPosition.row + 1,
					lineEnd: member.endPosition.row + 1,
					parentName: nameNode?.text
				});
			}
		}
	}

	return {
		name: nameNode?.text ?? '<anonymous>',
		kind: 'class',
		lineStart: node.startPosition.row + 1,
		lineEnd: node.endPosition.row + 1,
		children: methods.length > 0 ? methods : undefined,
		badges: badges.length > 0 ? badges : undefined
	};
}

function buildImportSymbol(node: any): ASTSymbol {
	return {
		name: node.text,
		kind: 'import',
		lineStart: node.startPosition.row + 1,
		lineEnd: node.endPosition.row + 1
	};
}
