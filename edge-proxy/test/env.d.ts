declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {
		ROPEMAN_SHARE_STORE: KVNamespace;
		ROPEMAN_EXPLORE_STORE: KVNamespace;
	}
}
