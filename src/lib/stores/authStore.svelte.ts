import { settingsStore } from './settingsStore.svelte';
import { webgpuStore } from './webgpuStore.svelte';

export type AuthTrack = 'none' | 'edge' | 'byok' | 'webgpu';

function createAuthStore() {
	let edgeEnabled = $state(false);
	let preferredTrack = $state<AuthTrack | null>(null);

	return {
		get edgeEnabled() {
			return edgeEnabled;
		},
		set edgeEnabled(v: boolean) {
			edgeEnabled = v;
		},

		get isReady(): boolean {
			return edgeEnabled || settingsStore.hasApiKey || webgpuStore.isReady;
		},

		get preferredTrack() {
			return preferredTrack;
		},
		set preferredTrack(v: AuthTrack | null) {
			preferredTrack = v;
		},

		get activeTrack(): AuthTrack {
			// If user explicitly selected a track, use it (if still available)
			if (preferredTrack) {
				if (preferredTrack === 'edge') return 'edge';
				if (preferredTrack === 'byok' && settingsStore.hasApiKey) return 'byok';
				if (preferredTrack === 'webgpu' && webgpuStore.isReady) return 'webgpu';
				// preferred track not available, fall through to auto
			}
			if (edgeEnabled) return 'edge';
			if (webgpuStore.isReady) return 'webgpu';
			if (settingsStore.hasApiKey) return 'byok';
			return 'none';
		}
	};
}

export const authStore = createAuthStore();
