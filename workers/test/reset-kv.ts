import { beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

// The Workers Vitest plugin does not reset storage between the tests of a file, so this empties KV first
beforeEach(async () => {
	for (const kv of [env.ROPEMAN_SHARE_STORE, env.ROPEMAN_EXPLORE_STORE]) {
		const { keys } = await kv.list();
		await Promise.all(keys.map(({ name }) => kv.delete(name)));
	}
});
