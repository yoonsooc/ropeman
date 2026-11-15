import { beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

async function empty(kv: KVNamespace) {
	let cursor: string | undefined;
	do {
		const page = await kv.list({ cursor });
		await Promise.all(page.keys.map(({ name }) => kv.delete(name)));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
}

// The Workers Vitest plugin does not reset storage between the tests of a file, so this empties KV first
beforeEach(async () => {
	await empty(env.ROPEMAN_SHARE_STORE);
	await empty(env.ROPEMAN_EXPLORE_STORE);
});
