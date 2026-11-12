import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { detectLanguage } from '$lib/utils/languageDetector';
import { fileFromAst } from '$lib/services/skeletonExtractor';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';

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

type Site = [kind: string, line: number, from: string | null, written: string | null];

/** The code map sites of one file as `[kind, line, from, written]`, `from` without the path. */
async function sites(filePath: string, content: string): Promise<Site[]> {
	await onmessage({
		data: { type: 'parse', filePath, content, language: detectLanguage(filePath) }
	});
	const result = posted.pop() as { type: string; symbols: ASTSymbol[]; refs: ASTRef[] };
	expect(result).toMatchObject({ type: 'parse-result', filePath });
	return fileFromAst(filePath, result.symbols, result.refs).refs.map((ref) => [
		ref.kind,
		ref.line,
		ref.from && ref.from.slice(filePath.length + 1),
		ref.written
	]);
}

describe('parserWorker call sites in the code map', () => {
	it('reads TypeScript calls, constructors, dynamic imports and class bases', async () => {
		// Arrange
		const source = `import { z } from 'zod';
export class Store extends Base<Item> implements Saver, Loader<Item> {
	save() {
		this.flush();
		return z.object({ a: z.string() }).strict();
	}
}
export const load = async () => {
	const mod = await import('./lazy');
	return new Store(mod.default)
		.save();
};
helper<number>(1);
`;

		// Act
		const found = await sites('repo/src/store.ts', source);

		// Assert
		expect(found).toEqual([
			['inherits', 2, 'Store', 'Base'],
			['implements', 2, 'Store', 'Saver'],
			['implements', 2, 'Store', 'Loader'],
			['calls', 4, 'Store.save', 'this.flush'],
			['calls', 5, 'Store.save', 'z.object().strict'],
			['calls', 5, 'Store.save', 'z.object'],
			['calls', 5, 'Store.save', 'z.string'],
			['dynamic_import', 9, 'load', './lazy'],
			['calls', 10, 'load', 'new Store().save'],
			['calls', 10, 'load', 'Store'],
			['calls', 13, null, 'helper']
		]);
	});

	it('reads component elements in TSX as calls and skips intrinsic tags', async () => {
		// Arrange
		const source = `export function Page() {
	const [n, setN] = useState(0);
	return (
		<Layout.Frame>
			<div onClick={() => setN(n + 1)}>
				<Counter value={n} />
			</div>
		</Layout.Frame>
	);
}
`;

		// Act
		const found = await sites('repo/src/Page.tsx', source);

		// Assert
		expect(found).toEqual([
			['calls', 2, 'Page', 'useState'],
			['calls', 4, 'Page', 'Layout.Frame'],
			['calls', 5, 'Page', 'setN'],
			['calls', 6, 'Page', 'Counter']
		]);
	});

	it('reads JavaScript calls and a class base given as an expression', async () => {
		// Arrange
		const source = `class Widget extends mixin(Base) {
	render() {
		return h('div', this.props);
	}
}
module.exports = () => import('./widget.js');
`;

		// Act
		const found = await sites('repo/lib/widget.js', source);

		// Assert
		expect(found).toEqual([
			['inherits', 1, 'Widget', 'mixin()'],
			['calls', 1, 'Widget', 'mixin'],
			['calls', 3, 'Widget.render', 'h'],
			['dynamic_import', 6, null, './widget.js']
		]);
	});

	it('reads Python calls, decorators and positional bases only', async () => {
		// Arrange
		const source = `import os
class Repo(Base, mixins.Cache, metaclass=Meta):
    def save(self, item):
        self.validate(item)
        os.path.join("a", "b")
        return super().save(item)

@app.route("/x")
def view():
    return Repo()

print("top")
`;

		// Act
		const found = await sites('repo/app/repo.py', source);

		// Assert
		expect(found).toEqual([
			['inherits', 2, 'Repo', 'Base'],
			['inherits', 2, 'Repo', 'mixins.Cache'],
			['calls', 4, 'Repo.save', 'self.validate'],
			['calls', 5, 'Repo.save', 'os.path.join'],
			['calls', 6, 'Repo.save', 'super().save'],
			['calls', 6, 'Repo.save', 'super'],
			['calls', 8, null, 'app.route'],
			['calls', 10, 'view', 'Repo'],
			['calls', 12, null, 'print']
		]);
	});

	it('drops a class base when the parser did not record the class', async () => {
		// Arrange
		const source = `def factory():
    class Local(Base):
        pass
    return Local()
`;

		// Act
		const found = await sites('repo/app/factory.py', source);

		// Assert
		expect(found).toEqual([['calls', 4, 'factory', 'Local']]);
	});

	it('reads the calls of a Svelte script block at their file lines', async () => {
		// Arrange
		const source = `<h1>{title}</h1>

<script lang="ts">
	import { onMount } from 'svelte';
	let { title } = $props();
	function refresh() {
		load(title);
	}
	onMount(refresh);
</script>
`;

		// Act
		const found = await sites('repo/src/Title.svelte', source);

		// Assert
		expect(found).toEqual([
			['calls', 5, null, '$props'],
			['calls', 7, 'refresh', 'load'],
			['calls', 9, null, 'onMount']
		]);
	});

	it('leaves every call target pending for a resolver', async () => {
		// Arrange
		const filePath = 'repo/src/a.ts';
		await onmessage({
			data: { type: 'parse', filePath, content: 'function a() { b(); }\n', language: 'typescript' }
		});
		const result = posted.pop() as { symbols: ASTSymbol[]; refs: ASTRef[] };

		// Act
		const record = fileFromAst(filePath, result.symbols, result.refs);

		// Assert
		expect(record.refs).toEqual([
			{
				kind: 'calls',
				line: 1,
				from: 'repo/src/a.ts#a',
				written: 'b',
				target: { state: 'pending' }
			}
		]);
	});

	it.each<[string, string, Site[]]>([
		[
			'repo/cmd/main.go',
			`package main

func (s *Server) Run() {
	fmt.Println(s.name())
}

func main() {
	s := NewServer()
	s.Run()
}
`,
			[
				['calls', 4, 'Server.Run', 'fmt.Println'],
				['calls', 4, 'Server.Run', 's.name'],
				['calls', 8, 'main', 'NewServer'],
				['calls', 9, 'main', 's.Run']
			]
		],
		[
			'repo/src/lib.rs',
			`fn main() {
    let v = Vec::<u8>::new();
    v.push(helper(1));
    println!("{}", v.len());
}
`,
			[
				['calls', 2, 'main', 'Vec::<u8>::new'],
				['calls', 3, 'main', 'v.push'],
				['calls', 3, 'main', 'helper']
			]
		],
		[
			'repo/src/App.java',
			`class App {
    void run() {
        log("start");
        this.repo.save(new User());
    }
}
`,
			[
				['calls', 3, 'App.run', 'log'],
				['calls', 4, 'App.run', 'this.repo.save'],
				['calls', 4, 'App.run', 'User']
			]
		],
		[
			'repo/src/main.c',
			`int main(void) {
    init(argv[0]);
    return dev->ops->start(dev);
}
`,
			[
				// The C outline names no function yet, so its calls come from `<anonymous>`
				['calls', 2, '<anonymous>', 'init'],
				['calls', 3, '<anonymous>', 'dev->ops->start']
			]
		],
		[
			'repo/src/app.cpp',
			`class App {
  void run() {
    std::sort(v.begin(), v.end());
    auto *w = new Widget();
  }
};
`,
			[
				['calls', 3, 'App.run()', 'std::sort'],
				['calls', 3, 'App.run()', 'v.begin'],
				['calls', 3, 'App.run()', 'v.end'],
				['calls', 4, 'App.run()', 'Widget']
			]
		],
		[
			'repo/lib/app.rb',
			`class App
  def run
    log("start")
    repo.save user
  end
end
`,
			[
				['calls', 3, 'App.run', 'log'],
				['calls', 4, 'App.run', 'repo.save']
			]
		],
		[
			'repo/src/App.php',
			`<?php
class App {
    function run() {
        log_start(1);
        $this->repo->save(new User());
        Cache::clear();
    }
}
`,
			[
				['calls', 4, 'App.run', 'log_start'],
				['calls', 5, 'App.run', '$this->repo->save'],
				['calls', 5, 'App.run', 'User'],
				['calls', 6, 'App.run', 'Cache::clear']
			]
		],
		[
			'repo/Sources/App.swift',
			`class App {
    func run() {
        log("start")
        repo.save(user)
    }
}
`,
			[
				['calls', 3, 'App', 'log'],
				['calls', 4, 'App', 'repo.save']
			]
		],
		[
			'repo/src/App.kt',
			`fun run() {
    log("start")
    items.forEach { save(it) }
}
`,
			[
				// As in C, the Kotlin outline does not read function names yet
				['calls', 2, '<anonymous>', 'log'],
				['calls', 3, '<anonymous>', 'items.forEach'],
				['calls', 3, '<anonymous>', 'save']
			]
		],
		[
			'repo/src/App.cs',
			`class App {
    void Run() {
        Log("start");
        repo.Save(new User());
    }
}
`,
			[
				['calls', 3, 'App.Run', 'Log'],
				['calls', 4, 'App.Run', 'repo.Save'],
				['calls', 4, 'App.Run', 'User']
			]
		],
		[
			'repo/src/App.scala',
			`object App {
  def run(): Unit = {
    log("start")
    repo.save(user)
  }
}
`,
			[
				['calls', 3, 'App', 'log'],
				['calls', 4, 'App', 'repo.save']
			]
		]
	])('reads the calls in %s', async (filePath, source, expected) => {
		// Act
		const found = await sites(filePath, source);

		// Assert
		expect(found).toEqual(expected);
	});
});
