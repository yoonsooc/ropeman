import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import { detectLanguage } from '$lib/utils/languageDetector';
import { buildCodeMap } from '$lib/services/codeMapBuilder';
import { formatPayloadPreview, selectSkeleton } from '$lib/services/skeletonExtractor';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import golden from '$lib/services/__fixtures__/skeletonWire.golden.json';
import { FIXTURE_AST } from '$lib/services/__fixtures__/skeletonWire';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import type { SkeletonFile } from '$lib/types/skeleton';
import {
	aliasImports,
	GRAMMAR_IMPORT_ALIASES,
	servedGrammar,
	upstreamGrammar
} from '../../../scripts/alias-grammar-imports.mjs';

vi.mock('web-tree-sitter', async (importOriginal) => {
	const real = await importOriginal<typeof import('web-tree-sitter')>();
	const { fileURLToPath } = await import('node:url');
	const fromStatic = (url: string) =>
		fileURLToPath(new URL(`../../../static${url}`, import.meta.url));

	class Parser extends real.Parser {
		static init() {
			return real.Parser.init({ locateFile: () => fromStatic('/tree-sitter.wasm') });
		}
	}
	const Language = { load: (url: string) => real.Language.load(fromStatic(url)) };
	return { Parser, Language, Query: real.Query };
});

const posted: unknown[] = [];
let onmessage: (e: { data: unknown }) => Promise<void>;

beforeAll(async () => {
	const workerScope = { postMessage: (msg: unknown) => posted.push(msg), onmessage: null };
	vi.stubGlobal('self', workerScope);
	await import('./parserWorker');
	onmessage = workerScope.onmessage as unknown as typeof onmessage;
	await onmessage({ data: { type: 'init' } });
	expect(posted.pop()).toEqual({ type: 'init-done' });
});

afterAll(() => {
	vi.unstubAllGlobals();
});

interface Parsed {
	symbols: ASTSymbol[];
	refs: ASTRef[];
}

async function parse(filePath: string, content: string): Promise<Parsed> {
	await onmessage({
		data: { type: 'parse', filePath, content, language: detectLanguage(filePath) }
	});
	const result = posted.pop() as { type: string; symbols: ASTSymbol[]; refs: ASTRef[] };
	expect(result).toMatchObject({ type: 'parse-result', filePath });
	return result;
}

type Outline = [kind: string, name: string, lines: string, children?: Outline[]];

/** Symbols as `[kind, name, "start-end", children]`, so a whole outline reads as one literal. */
function outline(symbols: readonly ASTSymbol[]): Outline[] {
	return symbols.map((sym) => {
		const row: Outline = [sym.kind, sym.name, `${sym.lineStart}-${sym.lineEnd}`];
		if (sym.children) row.push(outline(sym.children));
		return row;
	});
}

describe('YAML outline', () => {
	it('reads a GitHub Actions workflow as top-level keys, jobs and the actions they use', async () => {
		// Arrange
		const workflow = `name: CI
on:
  push:
    branches: [main]
env:
  NODE_VERSION: 20
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Setup
        uses: "actions/setup-node@v4"
        with:
          node-version: \${{ env.NODE_VERSION }}
      - run: |
          npm ci
          npm test
  deploy:
    needs: test
    uses: ./.github/workflows/deploy.yml
    secrets: inherit
`;

		// Act
		const { symbols } = await parse('repo/.github/workflows/ci.yml', workflow);

		// Assert
		expect(outline(symbols)).toEqual([
			['key', 'name', '1-1'],
			['key', 'on', '2-4'],
			['key', 'env', '5-6', [['env', 'NODE_VERSION', '6-6']]],
			[
				'key',
				'jobs',
				'7-22',
				[
					[
						'job',
						'test',
						'8-18',
						[
							['import', 'actions/checkout@v4', '11-11'],
							['import', 'actions/setup-node@v4', '13-13']
						]
					],
					['job', 'deploy', '19-22', [['import', './.github/workflows/deploy.yml', '21-21']]]
				]
			]
		]);
	});

	it('reads a Compose file as services with their image, build, ports, depends_on and env keys', async () => {
		// Arrange
		const compose = `services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "8080:80"
      - target: 9229
        published: 9230
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://app@db/app
      LOG_LEVEL: info
  db:
    image: postgres:16
    environment:
      - POSTGRES_PASSWORD=example
  worker:
    build: ./worker
    depends_on: [db, api]
volumes:
  pgdata: {}
`;

		// Act
		const { symbols } = await parse('repo/docker-compose.yml', compose);

		// Assert
		expect(outline(symbols)).toEqual([
			[
				'key',
				'services',
				'1-22',
				[
					[
						'service',
						'api',
						'2-15',
						[
							['import', './api', '3-5'],
							['port', '8080:80', '7-7'],
							['port', '9230:9229', '8-9'],
							['import', 'db', '11-12'],
							['env', 'DATABASE_URL', '14-14'],
							['env', 'LOG_LEVEL', '15-15']
						]
					],
					['service', 'db', '16-19', [['import', 'postgres:16', '17-17']]],
					[
						'service',
						'worker',
						'20-22',
						[
							['import', './worker', '21-21'],
							['import', 'db', '22-22'],
							['import', 'api', '22-22']
						]
					]
				]
			],
			['key', 'volumes', '23-24']
		]);
	});

	it('reads each Kubernetes object as Kind/name with its images and data keys', async () => {
		// Arrange
		const manifests = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      initContainers:
        - name: migrate
          image: ghcr.io/acme/migrate:1.2
      containers:
        - name: api
          image: ghcr.io/acme/api:1.2
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
data:
  password: c2VjcmV0
stringData:
  username: admin
---
apiVersion: v1
kind: Service
metadata: { name: api }
spec:
  ports: [{ port: 80 }]
`;

		// Act
		const { symbols } = await parse('repo/k8s/api.yaml', manifests);

		// Assert
		expect(outline(symbols)).toEqual([
			[
				'resource',
				'Deployment/api',
				'1-15',
				[
					['import', 'ghcr.io/acme/migrate:1.2', '10-10'],
					['import', 'ghcr.io/acme/api:1.2', '13-13']
				]
			],
			[
				'resource',
				'Secret/db-creds',
				'17-25',
				[
					['key', 'password', '23-23'],
					['key', 'username', '25-25']
				]
			],
			['resource', 'Service/api', '27-31']
		]);
	});

	it('reads only the top-level keys of any other YAML, never the lines of a block scalar', async () => {
		// Arrange
		const config = `# mkdocs
site_name: Docs
defaults: &defaults
  adapter: postgres
production:
  <<: *defaults
  database: prod
"quoted key": yes
notes: |
  looks_like_a_key: but is text
`;

		// Act
		const { symbols } = await parse('repo/config/settings.yml', config);

		// Assert
		expect(outline(symbols)).toEqual([
			['key', 'site_name', '2-2'],
			['key', 'defaults', '3-4'],
			['key', 'production', '5-7'],
			['key', 'quoted key', '8-8'],
			['key', 'notes', '9-10']
		]);
	});

	it('keeps the valid documents and reads nothing from a broken one', async () => {
		// Arrange
		const manifests = `apiVersion: v1
kind: ConfigMap
metadata:
  name: app
---
broken: [unclosed
  value: text
---
kind: plain
`;

		// Act
		const { symbols } = await parse('repo/k8s/mixed.yaml', manifests);

		// Assert
		expect(outline(symbols)).toEqual([['resource', 'ConfigMap/app', '1-4']]);
		expect(JSON.stringify(symbols)).not.toContain('value');
	});

	it('gives no symbols for a YAML list, without failing the file', async () => {
		// Act
		const { symbols } = await parse('repo/playbook.yml', '- hosts: all\n  tasks: []\n');

		// Assert
		expect(symbols).toEqual([]);
	});
});

describe('TOML outline', () => {
	it('reads pyproject tables, PEP 621 and Poetry dependencies and entry points', async () => {
		// Arrange
		const pyproject = `[build-system]
requires = ["hatchling>=1.18"]
build-backend = "hatchling.build"

[project]
name = "paseo"
dependencies = [
  "fastapi[standard]>=0.110",
  "pydantic==2.*; python_version >= '3.11'",
  'private-sdk @ https://example.com/private_sdk-1.0.whl',
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff"]

[project.scripts]
paseo = "paseo.cli:main"

[tool.poetry.dependencies]
python = "^3.11"
httpx = { version = "^0.27", extras = ["http2"] }

[tool.ruff]
line-length = 100
`;

		// Act
		const { symbols } = await parse('repo/pyproject.toml', pyproject);

		// Assert
		expect(outline(symbols)).toEqual([
			['table', 'build-system', '1-4', [['import', 'hatchling', '2-2']]],
			[
				'table',
				'project',
				'5-12',
				[
					['import', 'fastapi', '8-8'],
					['import', 'pydantic', '9-9'],
					['import', 'private-sdk', '10-10']
				]
			],
			[
				'table',
				'project.optional-dependencies',
				'13-15',
				[
					['import', 'pytest', '14-14'],
					['import', 'ruff', '14-14']
				]
			],
			['table', 'project.scripts', '16-18', [['target', 'paseo', '17-17']]],
			[
				'table',
				'tool.poetry.dependencies',
				'19-22',
				[
					['import', 'python', '20-20'],
					['import', 'httpx', '21-21']
				]
			],
			['table', 'tool.ruff', '23-24']
		]);
	});

	it('reads Cargo dependency tables, target-specific ones and arrays of tables', async () => {
		// Arrange
		const cargo = `edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = "1"

[target.'cfg(unix)'.dependencies]
nix = "0.29"

[[bin]]
name = "server"
`;

		// Act
		const { symbols } = await parse('repo/Cargo.toml', cargo);

		// Assert
		expect(outline(symbols)).toEqual([
			['key', 'edition', '1-1'],
			[
				'table',
				'dependencies',
				'3-6',
				[
					['import', 'serde', '4-4'],
					['import', 'tokio', '5-5']
				]
			],
			['table', 'target.cfg(unix).dependencies', '7-9', [['import', 'nix', '8-8']]],
			['table', 'bin', '10-11']
		]);
	});
});

describe('JSON outline', () => {
	it('reads package.json keys, scripts and every dependency object', async () => {
		// Arrange
		const pkg = `{
  "name": "ropeman",
  "private": true,
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  },
  "dependencies": { "@xyflow/svelte": "^1.0.0" },
  "devDependencies": { "vitest": "^3.0.0" }
}
`;

		// Act
		const { symbols } = await parse('repo/package.json', pkg);

		// Assert
		expect(outline(symbols)).toEqual([
			['key', 'name', '2-2'],
			['key', 'private', '3-3'],
			[
				'key',
				'scripts',
				'4-7',
				[
					['target', 'dev', '5-5'],
					['target', 'build', '6-6']
				]
			],
			['key', 'dependencies', '8-8', [['import', '@xyflow/svelte', '8-8']]],
			['key', 'devDependencies', '9-9', [['import', 'vitest', '9-9']]]
		]);
	});

	it('reads a tsconfig with comments and trailing commas, and the configs it extends and references', async () => {
		// Arrange
		const tsconfig = `{
  // Shared settings
  "extends": ["./tsconfig.base.json", "@tsconfig/svelte"],
  "compilerOptions": {
    "strict": true,
  },
  "references": [{ "path": "./packages/server" }],
}
`;

		// Act
		const { symbols } = await parse('repo/tsconfig.json', tsconfig);

		// Assert
		expect(outline(symbols)).toEqual([
			[
				'key',
				'extends',
				'3-3',
				[
					['import', './tsconfig.base.json', '3-3'],
					['import', '@tsconfig/svelte', '3-3']
				]
			],
			['key', 'compilerOptions', '4-6'],
			['key', 'references', '7-7', [['import', './packages/server', '7-7']]]
		]);
	});

	it('reads composer.json require blocks as imports', async () => {
		// Act
		const { symbols } = await parse(
			'repo/composer.json',
			'{"require": {"php": ">=8.2", "laravel/framework": "^11"}, "require-dev": {"phpunit/phpunit": "^11"}}'
		);

		// Assert
		expect(outline(symbols)).toEqual([
			[
				'key',
				'require',
				'1-1',
				[
					['import', 'php', '1-1'],
					['import', 'laravel/framework', '1-1']
				]
			],
			['key', 'require-dev', '1-1', [['import', 'phpunit/phpunit', '1-1']]]
		]);
	});
});

describe('Bash outline', () => {
	it('reads functions and sourced files, and the commands and scripts each function runs', async () => {
		// Arrange
		const script = `#!/usr/bin/env bash
set -euo pipefail
source ./lib/common.sh
. "$DIR/env.sh"
source <(kubectl completion bash)

build() {
  npm run build
  ./scripts/package.sh --release
}

function deploy {
  bash deploy/upload.sh
  sh -e notify.sh
  build
}

deploy
`;

		// Act
		const { symbols, refs } = await parse('repo/scripts/release.sh', script);
		const sites = buildCodeMap(new Map([['repo/scripts/release.sh', symbols]]), null, {
			refs: new Map([['repo/scripts/release.sh', refs]])
		})
			.files.get('repo/scripts/release.sh' as never)!
			.refs.map((ref) => [ref.line, ref.from?.split('#')[1] ?? null, ref.written]);

		// Assert
		expect(outline(symbols)).toEqual([
			['import', 'source ./lib/common.sh', '3-3'],
			['import', '. "$DIR/env.sh"', '4-4'],
			['function', 'build', '7-10'],
			['function', 'deploy', '12-16']
		]);
		expect(sites).toEqual([
			[2, null, 'set'],
			[5, null, 'kubectl'],
			[8, 'build', 'npm'],
			[9, 'build', './scripts/package.sh'],
			[13, 'deploy', 'deploy/upload.sh'],
			[15, 'deploy', 'build'],
			[18, null, 'deploy']
		]);
	});
});

describe('argument and credential text', () => {
	it('reads only bare script paths after a shell runner, never a quoted or expanded argument', async () => {
		// Arrange
		const script = `exec "secret with words"
bash 'literal-token'
sh $SCRIPT_TOKEN
bash "$DIR_TOKEN/run.sh"
bash ./$PART_TOKEN.sh
FOO_TOKEN=bar ./run.sh
"$CMD_TOKEN" --flag
bash -c 'echo hi'
bash ./ok.sh
q
`;

		// Act
		const { symbols, refs } = await parse('repo/run.sh', script);

		// Assert
		expect(refs.map((ref) => [ref.line, ref.written])).toEqual([
			[6, './run.sh'],
			[9, './ok.sh'],
			// Regression: the query's `\\.` reached the regex as `.`, so any one-letter command was dropped
			[10, 'q']
		]);
		const read = JSON.stringify([symbols, refs]);
		for (const text of ['secret', 'literal', 'SCRIPT_TOKEN', 'DIR_TOKEN', 'PART_TOKEN']) {
			expect(read).not.toContain(text);
		}
		expect(read).not.toContain('CMD_TOKEN');
		expect(read).not.toContain('FOO_TOKEN');
	});

	it('names a reference without its URL userinfo, registry login, query, fragment or digest', async () => {
		// Arrange
		const digest = 'sha256:' + 'ab12'.repeat(16);
		const compose = `services:
  api:
    image: deploy:hunter2@registry.example.com/acme/api:1
    build:
      context: https://x-access-token:ghp_secret@github.com/acme/api.git#main:docker
  db:
    image: postgres:16@${digest}
  web:
    build: git@github.com:acme/web.git?token=abc
`;
		const workflow = `jobs:
  ship:
    steps:
      - uses: docker://bot:tok@ghcr.io/acme/img:1
      - uses: actions/checkout@v4
`;
		const tsconfig = `{"extends": ["@tsconfig/node20/tsconfig.json", "https://u:pw@cdn.example.com/base.json?sig=xyz"]}`;
		const script = 'source "tok@host/env.sh"\n';

		// Act
		const parsed = [
			await parse('repo/compose.yaml', compose),
			await parse('repo/.github/workflows/ship.yml', workflow),
			await parse('repo/tsconfig.json', tsconfig),
			await parse('repo/env.sh', script)
		];

		// Assert
		const names = (symbols: readonly ASTSymbol[]): string[] =>
			symbols.flatMap((sym) => [sym.name, ...names(sym.children ?? [])]);
		expect(parsed.map(({ symbols }) => names(symbols))).toEqual([
			[
				'services',
				'api',
				'registry.example.com/acme/api:1',
				'https://github.com/acme/api.git',
				'db',
				'postgres:16',
				'web',
				'github.com:acme/web.git'
			],
			['jobs', 'ship', 'docker://ghcr.io/acme/img:1', 'actions/checkout@v4'],
			['extends', '@tsconfig/node20/tsconfig.json', 'https://cdn.example.com/base.json'],
			['source host/env.sh"']
		]);
		const read = JSON.stringify(parsed);
		for (const text of [
			'hunter2',
			'ghp_secret',
			'access-token',
			'main:docker',
			'ab12',
			'abc',
			'tok',
			'pw',
			'xyz'
		]) {
			expect(read).not.toContain(text);
		}
	});

	it('stops reading container images and sourced files past 64 levels of nesting', async () => {
		// Arrange
		const containers = (image: string) => `{containers: [{name: c, image: ${image}}]}`;
		const nest = (depth: number, inner: string) => '{n: '.repeat(depth) + inner + '}'.repeat(depth);
		const k8s = `apiVersion: v1
kind: Pod
metadata:
  name: p
spec: ${nest(2, containers('shallow:1'))}
status: ${nest(100, containers('deep:1'))}
`;
		const script = `${'( '.repeat(100)}source ./deep.sh${' )'.repeat(100)}\n( source ./shallow.sh )\n`;

		// Act
		const yaml = await parse('repo/pod.yaml', k8s);
		const bash = await parse('repo/nested.sh', script);

		// Assert
		expect(yaml.symbols.map((sym) => sym.children?.map((child) => child.name))).toEqual([
			['shallow:1']
		]);
		expect(bash.symbols.map((sym) => sym.name)).toEqual(['source ./shallow.sh']);
	});
});

describe('config outline secrets', () => {
	/** A seeded generator, so a failure names the round that reproduces it. */
	function tokens(seed: number) {
		let state = seed;
		const next = () => {
			state = (state + 0x6d2b79f5) | 0;
			let t = Math.imul(state ^ (state >>> 15), 1 | state);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const issued: string[] = [];
		const token = (prefix: string) => {
			const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
			let text = prefix;
			for (let i = 0; i < 14; i++) text += alphabet[Math.floor(next() * alphabet.length)];
			issued.push(text);
			return text;
		};
		return {
			issued,
			/** A secret value */
			v: () => token('sv'),
			/** A key-shaped fragment inside a value, which must not become a key */
			k: () => token('KV_'),
			pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]
		};
	}

	function files(seed: number): { files: [string, string][]; issued: string[] } {
		const { issued, v, k, pick } = tokens(seed);
		const quote = (text: string) => pick([text, `"${text}"`, `'${text}'`]);
		const workflow = `name: ${v()}
env:
  API_TOKEN: ${quote(v())}
jobs:
  build:
    runs-on: ${v()}
    env:
      NPM_TOKEN: \${{ secrets.${k()} }}
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${quote(v())}
      - uses: docker://bot:${v()}@ghcr.io/acme/img:1
      - run: ${pick(['|', '>', '|-'])}
          ${k()}: ${v()}
          echo ${v()}
      - name: "${k()}: ${v()}"
        run: 'curl -H "Authorization: ${v()}"'
`;
		const compose = `services:
  api:
    image: node:20
    environment:
      DB_PASSWORD: ${quote(v())}
      NESTED: { ${k()}: ${v()} }
    command: ["--password", "${v()}"]
  db:
    image: postgres:16
    environment:
      - ${k()}=${v()}
      - "${k()}=${v()}"
      - ${k()}
    healthcheck:
      test: ${pick(['|', '>'])}
        ${k()}: ${v()}
  private:
    image: ${v()}:${v()}@registry.example.com/acme/app:1
    build:
      context: https://x-access-token:${v()}@github.com/acme/app.git#${v()}
`;
		const k8s = `apiVersion: v1
kind: Secret
metadata:
  name: creds
data:
  password: ${v()}
  api-key: ${quote(v())}
stringData:
  config.yaml: |
    ${k()}: ${v()}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/api:1
        - name: sidecar
          image: ${v()}@registry.local/sidecar:1
          args: ["--token", "${v()}"]
          env:
            - name: ${k()}
              value: ${quote(v())}
`;
		const pyproject = `token = "${v()}"
[project]
dependencies = ["pkg @ https://user:${v()}@example.com/pkg.whl", "other>=1; extra == '${v()}'"]
[tool.poetry.dependencies]
private = { git = "https://${v()}@github.com/acme/private.git" }
[tool.settings]
password = '${v()}'
notes = """
${k()} = "${v()}"
"""
[project.scripts]
cli = "${v()}"
`;
		const pkg = `{
  "name": "${v()}",
  "scripts": { "deploy": "curl -H 'Authorization: ${v()}' https://example.com" },
  "dependencies": { "x": "https://${v()}@example.com/x.tgz" },
  "config": { "token": "${v()}", "${k()}": "x" },
  "extends": "https://${v()}@example.com/base.json?sig=${v()}"
}`;
		const script = `export TOKEN=${v()}
API_KEY="${v()}"
curl -H "Authorization: Bearer ${v()}" https://example.com
deploy() {
  local secret=${v()}
  echo "${k()}: ${v()}"
}
source ./env.sh ${v()}
exec "${v()} ${v()}"
bash '${v()}'
bash "$${k()}"
sh ./$${k()}.sh
"$${k()}" --flag
${k()}=${v()} ./run.sh
`;
		// The fragment in `config` above is a key; keys of unread objects are never names either
		return {
			issued,
			files: [
				['repo/.github/workflows/ci.yml', workflow],
				['repo/docker-compose.yml', compose],
				['repo/k8s/app.yaml', k8s],
				['repo/pyproject.toml', pyproject],
				['repo/package.json', pkg],
				['repo/deploy.sh', script]
			]
		};
	}

	it('names symbols from keys and references only, never from a value, in 40 generated rounds', async () => {
		for (let round = 1; round <= 40; round++) {
			// Arrange
			const { files: generated, issued } = files(round);
			const astMap = new Map<string, ASTSymbol[]>();
			const refs = new Map<string, ASTRef[]>();

			// Act
			for (const [path, content] of generated) {
				const parsed = await parse(path, content);
				astMap.set(path, parsed.symbols);
				refs.set(path, parsed.refs);
			}
			const codeMap = buildCodeMap(astMap, null, { refs });
			const wire = formatPayloadPreview(selectSkeleton('repo', null, astMap).payload);
			const read = JSON.stringify([...astMap, ...refs, ...codeMap.files]) + wire;

			// Assert
			const leaked = issued.filter((token) => read.includes(token));
			expect(leaked, `round ${round}`).toEqual([]);
			for (const key of [
				'API_TOKEN',
				'NPM_TOKEN',
				'DB_PASSWORD',
				'password',
				'api-key',
				'deploy',
				'cli'
			]) {
				expect(read, `round ${round}`).toContain(`"${key}"`);
			}
		}
	});
});

describe('grammar builds', () => {
	const imports = (bytes: Uint8Array) =>
		WebAssembly.Module.imports(new WebAssembly.Module(new Uint8Array(bytes))).map(
			(entry) => entry.name
		);

	it.each(Object.entries(GRAMMAR_IMPORT_ALIASES))(
		'serves %s from tree-sitter-wasms with only the imports the runtime lacks renamed',
		(file, aliases) => {
			const upstream = fs.readFileSync(upstreamGrammar(file));
			const served = fs.readFileSync(servedGrammar(file));

			expect(Buffer.from(aliasImports(upstream, aliases)).equals(served)).toBe(true);
			expect(imports(upstream)).toEqual(expect.arrayContaining(Object.keys(aliases)));
			for (const name of Object.keys(aliases)) expect(imports(served)).not.toContain(name);
		}
	);

	it('parses the shell tests and YAML that called a missing import', async () => {
		// Regression: `[[ ... == ... ]]` called isalpha and any YAML called operator new, which
		// web-tree-sitter 0.25 does not export, so the parse threw "resolved is not a function"
		const script = await parse(
			'repo/check.sh',
			'check() {\n  if [[ "${1:-}" == "--check" ]]; then exit 1; fi\n}\n'
		);
		const yaml = await parse('repo/app.yml', 'name: app\n');

		expect(outline(script.symbols)).toEqual([['function', 'check', '1-3']]);
		expect(outline(yaml.symbols)).toEqual([['key', 'name', '1-1']]);
	});
});

describe('config outlines on the wire', () => {
	const unlimited = settingsStore.skeletonUnlimited;
	afterEach(() => {
		settingsStore.skeletonUnlimited = unlimited;
	});

	function treeOf(paths: string[]): FileNode {
		return {
			name: 'fixture',
			path: 'fixture',
			kind: 'directory',
			children: paths.map((path) => ({ name: path.split('/').pop()!, path, kind: 'file' as const }))
		};
	}

	it('keeps every code file byte for byte, and adds config files only when they carry symbols', async () => {
		// Arrange
		settingsStore.skeletonUnlimited = true;
		const files: [string, string][] = [
			[
				'fixture/.github/workflows/ci.yml',
				'jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n'
			],
			['fixture/compose.yaml', 'services:\n  api:\n    image: node:20\n    ports: ["3000:3000"]\n'],
			['fixture/pyproject.toml', '[project]\ndependencies = ["fastapi"]\n'],
			['fixture/package.json', '{"scripts": {"build": "vite build"}}'],
			['fixture/bin/run.sh', 'main() { echo; }\n'],
			['fixture/list.yml', '- a\n- b\n']
		];
		const astMap = new Map<string, ASTSymbol[]>(FIXTURE_AST);
		for (const [path, content] of files) astMap.set(path, (await parse(path, content)).symbols);

		// Act
		const selection = selectSkeleton('fixture', treeOf([...astMap.keys()]), astMap);

		// Assert
		const before: SkeletonFile[] = JSON.parse(golden['top/shapes'].wire!).files;
		const after = new Map(selection.payload.files.map((file) => [file.path, JSON.stringify(file)]));
		for (const file of before) expect(after.get(file.path)).toBe(JSON.stringify(file));
		expect(selection.payload.files.length).toBe(before.length + 5);
		expect(selection.omitted).toContainEqual({ path: 'fixture/list.yml', reason: 'no-symbols' });
		expect(after.get('fixture/.github/workflows/ci.yml')).toBe(
			'{"path":"fixture/.github/workflows/ci.yml","language":"yaml","symbols":[{"name":"jobs","kind":"key","children":[{"name":"test","kind":"job","children":[{"name":"actions/checkout@v4","kind":"import"}]}]}],"imports":[]}'
		);
		expect(after.get('fixture/compose.yaml')).toBe(
			'{"path":"fixture/compose.yaml","language":"yaml","symbols":[{"name":"services","kind":"key","children":[{"name":"api","kind":"service","children":[{"name":"node:20","kind":"import"},{"name":"3000:3000","kind":"port"}]}]}],"imports":[]}'
		);
		expect(after.get('fixture/pyproject.toml')).toContain('"language":"toml"');
		expect(after.get('fixture/package.json')).toBe(
			'{"path":"fixture/package.json","language":"json","symbols":[{"name":"scripts","kind":"key","children":[{"name":"build","kind":"target"}]}],"imports":[]}'
		);
		expect(formatPayloadPreview(selection.payload)).toContain(
			'{"path":"fixture/bin/run.sh","language":"bash","symbols":[{"name":"main","kind":"function"}],"imports":[]}'
		);
	});
});
