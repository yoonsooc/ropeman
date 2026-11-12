import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({
	configFile: false,
	root: repo,
	logLevel: 'warn',
	resolve: { alias: { $lib: `${repo}src/lib` } },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	optimizeDeps: { noDiscovery: true, include: [] }
});
let code;
try {
	const { main } = await server.ssrLoadModule('/scripts/paseo-comparison/experiment.ts');
	code = await main(process.argv.slice(2));
} finally {
	await server.close();
}
process.exit(code);
