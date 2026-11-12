import { settingsStore } from './settingsStore.svelte';
import { webgpuStore } from './webgpuStore.svelte';

export type AuthTrack = 'none' | 'edge' | 'byok' | 'bridge' | 'webgpu';
export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

function createAuthStore() {
	let bridgeStatus = $state<BridgeStatus>('disconnected');
	let bridgePort = $state(9800);
	let bridgeError = $state('');
	let edgeEnabled = $state(false);
	let preferredTrack = $state<AuthTrack | null>(null);

	return {
		get bridgeStatus() {
			return bridgeStatus;
		},
		set bridgeStatus(v: BridgeStatus) {
			bridgeStatus = v;
		},

		get bridgePort() {
			return bridgePort;
		},
		set bridgePort(v: number) {
			bridgePort = v;
		},

		get bridgeError() {
			return bridgeError;
		},
		set bridgeError(v: string) {
			bridgeError = v;
		},

		get edgeEnabled() {
			return edgeEnabled;
		},
		set edgeEnabled(v: boolean) {
			edgeEnabled = v;
		},

		get isReady(): boolean {
			return (
				edgeEnabled ||
				settingsStore.hasApiKey ||
				bridgeStatus === 'connected' ||
				webgpuStore.isReady
			);
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
				if (preferredTrack === 'bridge' && bridgeStatus === 'connected') return 'bridge';
				if (preferredTrack === 'webgpu' && webgpuStore.isReady) return 'webgpu';
				// preferred track not available, fall through to auto
			}
			if (bridgeStatus === 'connected') return 'bridge';
			if (edgeEnabled) return 'edge';
			if (webgpuStore.isReady) return 'webgpu';
			if (settingsStore.hasApiKey) return 'byok';
			return 'none';
		}
	};
}

export const authStore = createAuthStore();
