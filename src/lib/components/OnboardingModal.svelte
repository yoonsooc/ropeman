<script lang="ts">
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { webgpuStore } from '$lib/stores/webgpuStore.svelte';
	import {
		extractSkeleton,
		estimatePayloadSize,
		formatPayloadPreview
	} from '$lib/services/skeletonExtractor';
	import { getProvider } from '$lib/data/aiProviders';
	import WebGPUSetupModal from './WebGPUSetupModal.svelte';

	let {
		open,
		onclose,
		onselect
	}: {
		open: boolean;
		onclose: () => void;
		onselect: (track: 'edge' | 'byok' | 'bridge' | 'webgpu') => void;
	} = $props();

	let showWebGPUSetup = $state(false);

	let showPreview = $state(false);

	const hasApiKey = $derived(settingsStore.hasApiKey);
	const currentProviderInfo = $derived(getProvider(settingsStore.aiProvider));
	const currentModelLabel = $derived(
		currentProviderInfo?.models.find((m) => m.id === settingsStore.aiModel)?.label ??
			settingsStore.aiModel
	);

	const skeleton = $derived(
		projectStore.fileTree
			? extractSkeleton(projectStore.projectName, projectStore.fileTree, projectStore.astMap)
			: null
	);

	const payloadSize = $derived(skeleton ? estimatePayloadSize(skeleton) : null);
	const payloadPreview = $derived(skeleton ? formatPayloadPreview(skeleton) : '');

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('onboarding-backdrop')) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop onboarding-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card onboarding-card" role="dialog" aria-modal="true">
			<div class="onboarding-header">
				<div>
					<h2>AI 아키텍처 분석</h2>
					<p class="onboarding-subtitle">코드의 논리적 구조를 자동으로 파악합니다</p>
				</div>
				<button class="modal-close onboarding-close" onclick={onclose}>&#10005;</button>
			</div>

			<div class="onboarding-body">
				<!-- Card A: Edge Proxy -->
				<div class="track-card highlighted">
					<div class="track-icon">⚡</div>
					<div class="track-content">
						<div class="track-title">빠른 체험</div>
						<div class="track-subtitle">1초 만에 논리적 구조 파악하기 (무료)</div>
						<p class="track-desc">
							서버를 경유하여 분석합니다. 소스 코드는 전송되지 않으며, 파일 구조 메타데이터만
							전달됩니다. Google Gemini 무료 등급으로 처리되어 입력이 Google 서비스 개선에 쓰일 수
							있습니다.
						</p>
					</div>
					<button class="track-btn primary" onclick={() => onselect('edge')}> 바로 시작 </button>
				</div>

				<!-- Card B: BYOK -->
				<div class="track-card">
					<div class="track-icon">🔑</div>
					<div class="track-content">
						<div class="track-title">
							내 API 키 사용 (BYOK)
							{#if hasApiKey}
								<span class="badge badge-success">API 키 설정됨 ✓</span>
							{/if}
						</div>
						<div class="track-subtitle">
							{currentProviderInfo?.label ?? 'Google Gemini'} &middot; {currentModelLabel}
						</div>
						<p class="track-desc">
							API 키를 입력하면 브라우저에서 직접 API를 호출합니다. 키는 로컬에만 저장됩니다.
						</p>
					</div>
					<button class="track-btn" onclick={() => onselect('byok')}>
						{hasApiKey ? '시작' : 'API 키 입력'}
					</button>
				</div>

				<!-- Card C: WebGPU -->
				<div class="track-card" class:disabled={!webgpuStore.isSupported}>
					<div class="track-icon">🧠</div>
					<div class="track-content">
						<div class="track-title">
							브라우저 내장 AI
							<span class="badge badge-muted">Beta</span>
						</div>
						{#if !webgpuStore.isSupported}
							<div class="track-subtitle">WebGPU 미지원 브라우저</div>
							<p class="track-desc">Chrome 113+ 또는 Edge 113+ 브라우저가 필요합니다.</p>
						{:else if webgpuStore.isReady}
							<div class="track-subtitle">모델 준비 완료</div>
							<p class="track-desc">
								로컬 AI 모델로 분석합니다. 데이터가 외부로 전송되지 않습니다.
							</p>
						{:else}
							<div class="track-subtitle">최초 1회 모델 다운로드 (~900MB)</div>
							<p class="track-desc">
								WebGPU를 활용한 로컬 AI 모델로 분석합니다. 다운로드 후 캐싱됩니다.
							</p>
						{/if}
					</div>
					{#if webgpuStore.isReady}
						<button class="track-btn" onclick={() => onselect('webgpu')}> 시작 </button>
					{:else}
						<button
							class="track-btn"
							disabled={!webgpuStore.isSupported}
							onclick={() => (showWebGPUSetup = true)}
						>
							{webgpuStore.isSupported ? '설정' : '미지원'}
						</button>
					{/if}
				</div>

				<!-- Payload Preview -->
				{#if skeleton}
					<div class="preview-section">
						<button class="preview-toggle" onclick={() => (showPreview = !showPreview)}>
							🔍 전송되는 데이터 미리보기
							<span class="toggle-arrow" class:expanded={showPreview}>▸</span>
						</button>
						{#if showPreview}
							<div class="preview-content">
								{#if payloadSize}
									<div class="preview-size">전송 데이터 크기: {payloadSize.formatted}</div>
								{/if}
								<pre class="preview-json">{payloadPreview}</pre>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<WebGPUSetupModal open={showWebGPUSetup} onclose={() => (showWebGPUSetup = false)} />

<style>
	.onboarding-card {
		width: 640px;
	}

	.onboarding-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid var(--border);
	}

	.onboarding-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.onboarding-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.onboarding-body {
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.track-card {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-secondary);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}

	.track-card:not(.disabled):hover {
		border-color: var(--accent);
	}

	.track-card.highlighted {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.track-card.disabled {
		opacity: 0.5;
	}

	.track-icon {
		font-size: 24px;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.track-content {
		flex: 1;
		min-width: 0;
	}

	.track-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.track-subtitle {
		font-size: 12px;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.track-desc {
		font-size: 12px;
		color: var(--text-muted);
		margin: 6px 0 0;
		line-height: 1.5;
	}

	.track-btn {
		flex-shrink: 0;
		align-self: center;
		padding: 8px 16px;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.track-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.track-btn.primary {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
	}

	.track-btn.primary:hover {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
		color: var(--on-accent);
	}

	.track-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.preview-section {
		margin-top: 4px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}

	.preview-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-secondary);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}

	.preview-toggle:hover {
		color: var(--text-primary);
	}

	.toggle-arrow {
		font-size: 11px;
		transition: transform 0.2s;
	}

	.toggle-arrow.expanded {
		transform: rotate(90deg);
	}

	.preview-content {
		margin-top: 10px;
	}

	.preview-size {
		font-size: 12px;
		color: var(--text-secondary);
		margin-bottom: 8px;
	}

	.preview-json {
		background: var(--code-bg);
		color: var(--code-text);
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		line-height: 1.5;
		padding: 12px;
		border-radius: 8px;
		max-height: 300px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	@media (max-width: 640px) {
		.track-card {
			flex-direction: column;
			gap: 10px;
		}

		.track-btn {
			align-self: stretch;
			text-align: center;
		}
	}
</style>
