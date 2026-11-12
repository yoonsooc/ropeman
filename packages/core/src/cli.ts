import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { extractDirectory } from './extract';

const USAGE = 'usage: ropeman-extract <folder> [--out <file.json>]\n';

async function main(): Promise<number> {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h' } }
	});
	if (values.help || positionals.length !== 1) {
		process.stderr.write(USAGE);
		return values.help ? 0 : 2;
	}

	const started = performance.now();
	const extraction = await extractDirectory(positionals[0], {
		wasmDir: fileURLToPath(new URL('./wasm', import.meta.url))
	});
	const seconds = (performance.now() - started) / 1000;

	const { map, hierarchy, listed, skipped } = extraction;
	const stats = {
		listed,
		mapped: map.files.size,
		skipped: skipped.length,
		seconds: Number(seconds.toFixed(2)),
		peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024)
	};
	process.stderr.write(`${JSON.stringify(stats)}\n`);

	if (values.out) {
		// An interim dump for inspection, not the ropeman.json format
		const dump = { stats, skipped, hierarchy, map: { ...map, files: [...map.files.values()] } };
		await writeFile(values.out, JSON.stringify(dump));
	}
	return 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		process.stderr.write(`ropeman-extract: ${err instanceof Error ? err.message : err}\n`);
		process.exit(1);
	}
);
