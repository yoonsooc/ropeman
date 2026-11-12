<script lang="ts">
	import { currentCoverage } from '$lib/services/coverageService';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import {
		COVERAGE_STATUSES,
		type CoverageReason,
		type CoverageStatus,
		type LevelCoverage
	} from '$lib/types/coverage';
	import { MAX_FILE_SIZE, MAX_FILES, MAX_TOTAL_SIZE } from '$lib/utils/filePriority';

	// Rows rendered per group; a filter narrows the rest
	const ROW_CAP = 200;

	let open = $state(false);
	let query = $state('');
	let picked = $state<CoverageStatus | null>(null);

	const parsing = $derived(
		projectStore.isLoading || projectStore.parsingProgress.done < projectStore.parsingProgress.total
	);
	const report = $derived(projectStore.fileTree && !parsing ? currentCoverage() : null);

	const n = (value: number) => value.toLocaleString(i18nStore.locale);

	const summaryParts = $derived.by(() => {
		if (!report) return [];
		const { byStatus } = report;
		const parts = [
			i18nStore.t('coverage.summary', {
				sent: n(byStatus.sent.length),
				read: n(report.read),
				total: report.read
			})
		];
		for (const status of ['cut', 'skipped', 'failed'] as const) {
			const count = byStatus[status].length;
			if (count > 0) parts.push(i18nStore.t(`coverage.${status}`, { count: n(count) }));
		}
		return parts;
	});

	const needle = $derived(query.trim().toLowerCase());
	const filtered = $derived(
		report
			? Object.fromEntries(
					COVERAGE_STATUSES.map((status) => [
						status,
						needle
							? report.byStatus[status].filter((f) => f.path.toLowerCase().includes(needle))
							: report.byStatus[status]
					])
				)
			: null
	);
	// Open on the first group that left something out, so the panel leads with what is missing
	const active = $derived<CoverageStatus>(
		picked ??
			COVERAGE_STATUSES.find((s) => s !== 'sent' && (report?.byStatus[s].length ?? 0) > 0) ??
			'sent'
	);
	const rows = $derived(filtered ? filtered[active] : []);

	function reasonLabel(reason: CoverageReason): string {
		return i18nStore.t(`coverage.reason.${reason}`, {
			limit: n(MAX_FILES),
			size: reason === 'total-size' ? `${MAX_TOTAL_SIZE / 1e6} MB` : `${MAX_FILE_SIZE / 1e3} KB`
		});
	}

	function levelLines(level: LevelCoverage): string[] {
		if (!level.assignment) {
			return level.overBudget > 0
				? [i18nStore.t('coverage.levelOverBudget', { count: level.overBudget })]
				: [i18nStore.t('coverage.levelUnknown')];
		}
		const { leftOut, invented, duplicated, emptied } = level.assignment;
		const lines = (
			[
				['levelOverBudget', level.overBudget],
				['levelLeftOut', leftOut],
				['levelInvented', invented],
				['levelDuplicated', duplicated],
				['levelEmptied', emptied]
			] as const
		)
			.filter(([, count]) => count > 0)
			.map(([key, count]) => i18nStore.t(`coverage.${key}`, { count }));
		return lines.length > 0 ? lines : [i18nStore.t('coverage.levelClean')];
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if report}
	<div class="coverage" data-testid="coverage">
		{#if open}
			<section
				id="coverage-panel"
				class="coverage-panel"
				aria-labelledby="coverage-title"
				data-testid="coverage-panel"
			>
				<header class="panel-head">
					<h2 id="coverage-title">{i18nStore.t('coverage.title')}</h2>
					<button
						class="close-btn"
						type="button"
						aria-label={i18nStore.t('common.close')}
						onclick={() => (open = false)}
					>
						<span class="material-symbols-outlined" aria-hidden="true">close</span>
					</button>
				</header>
				<p class="intro">{i18nStore.t('coverage.intro')}</p>

				<div class="groups" role="group" aria-label={i18nStore.t('coverage.title')}>
					{#each COVERAGE_STATUSES as status (status)}
						<button
							type="button"
							class="group-btn status-{status}"
							aria-pressed={active === status}
							data-testid="coverage-group-{status}"
							onclick={() => (picked = status)}
						>
							<span class="dot" aria-hidden="true"></span>
							{i18nStore.t(`coverage.status.${status}`)}
							<span class="count">{n(filtered![status].length)}</span>
						</button>
					{/each}
				</div>

				<input
					class="filter"
					type="search"
					placeholder={i18nStore.t('coverage.filter')}
					aria-label={i18nStore.t('coverage.filter')}
					bind:value={query}
				/>

				<ul class="rows" data-testid="coverage-rows">
					{#each rows.slice(0, ROW_CAP) as file (file.path)}
						<li>
							<span class="path" title={file.path}>{file.path}</span>
							<span class="reason">{reasonLabel(file.reason)}</span>
						</li>
					{:else}
						<li class="empty">{i18nStore.t('coverage.noMatch')}</li>
					{/each}
				</ul>
				{#if rows.length > ROW_CAP}
					<p class="capped">
						{i18nStore.t('coverage.capped', { shown: n(ROW_CAP), total: n(rows.length) })}
					</p>
				{/if}

				{#if report.levels.length > 0}
					<h3>{i18nStore.t('coverage.levelsTitle')}</h3>
					<ul class="levels" data-testid="coverage-levels">
						{#each report.levels as level (level.key)}
							<li style:padding-inline-start="{level.depth * 12}px">
								<span class="level-label">
									{level.depth === 0 ? i18nStore.t('coverage.levelRoot') : level.label}
								</span>
								<span class="level-lines">{levelLines(level).join(' · ')}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<button
			type="button"
			class="summary"
			aria-expanded={open}
			aria-controls="coverage-panel"
			title={i18nStore.t('coverage.toggle')}
			data-testid="coverage-summary"
			onclick={() => (open = !open)}
		>
			<span class="material-symbols-outlined" aria-hidden="true">fact_check</span>
			<span class="summary-text">{summaryParts.join(' · ')}</span>
			<span class="material-symbols-outlined chevron" aria-hidden="true">
				{open ? 'expand_more' : 'expand_less'}
			</span>
		</button>
	</div>
{/if}

<style>
	.coverage {
		position: relative;
		flex-shrink: 0;
		border-top: 1px solid var(--color-border);
		background: var(--color-background-surface);
	}

	.summary {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 28px;
		padding: 4px 12px;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font: 12px var(--font-body);
		text-align: start;
		cursor: pointer;
		/* The strip spans the pane edge to edge, so an outside ring would be cut off */
		--focus-outline-offset: -2px;
	}

	.summary:hover {
		color: var(--color-text-primary);
		background: var(--color-background-muted);
	}

	.summary .material-symbols-outlined {
		font-size: 16px;
	}

	.summary-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.coverage-panel {
		position: absolute;
		bottom: 100%;
		left: 8px;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(560px, calc(100% - 16px));
		max-height: min(70vh, 640px);
		padding: 12px;
		margin-bottom: 8px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-background-popover);
		box-shadow: 0 8px 24px var(--color-shadow);
		color: var(--color-text-primary);
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		margin: 0;
		font: 600 14px var(--font-display);
	}

	h3 {
		margin: 4px 0 0;
		font: 600 12px var(--font-body);
		color: var(--color-text-secondary);
	}

	.close-btn {
		display: inline-flex;
		padding: 2px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.close-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.intro,
	.capped {
		margin: 0;
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.groups {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.group-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: transparent;
		color: var(--color-text-secondary);
		font: 12px var(--font-body);
		cursor: pointer;
	}

	.group-btn[aria-pressed='true'] {
		border-color: var(--color-accent);
		background: var(--color-accent-muted);
		color: var(--color-text-primary);
	}

	.group-btn .count {
		font-variant-numeric: tabular-nums;
		color: var(--color-text-tertiary);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-text-tertiary);
	}

	.status-sent .dot {
		background: var(--color-icon-success);
	}

	.status-cut .dot {
		background: var(--color-icon-warning);
	}

	.status-failed .dot {
		background: var(--color-icon-error);
	}

	.filter {
		padding: 5px 8px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-background-body);
		color: var(--color-text-primary);
		font: 12px var(--font-body);
	}

	.rows,
	.levels {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}

	.rows {
		flex: 1;
		min-height: 80px;
	}

	.levels {
		max-height: 140px;
		flex-shrink: 0;
	}

	.rows li,
	.levels li {
		display: flex;
		gap: 12px;
		justify-content: space-between;
		padding: 3px 0;
		font-size: 12px;
		border-bottom: 1px solid var(--color-border);
	}

	.path {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-code);
	}

	.reason,
	.level-lines {
		flex-shrink: 0;
		max-width: 50%;
		color: var(--color-text-tertiary);
		text-align: end;
	}

	.level-lines {
		flex-shrink: 1;
		max-width: 70%;
	}

	.level-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		color: var(--color-text-tertiary);
	}
</style>
