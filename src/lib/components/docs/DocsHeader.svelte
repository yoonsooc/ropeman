<script lang="ts">
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';

	let {
		lang,
		slug,
		onMenuToggle
	}: {
		lang: 'ko' | 'en';
		slug: string;
		onMenuToggle?: () => void;
	} = $props();

	const otherLang = $derived<'ko' | 'en'>(lang === 'ko' ? 'en' : 'ko');
</script>

<header class="header">
	<div class="header-left">
		<button
			class="header-btn menu-btn"
			type="button"
			aria-label={i18nStore.t('docs.menu')}
			onclick={onMenuToggle}
		>
			<span class="material-symbols-outlined">menu</span>
		</button>
		<a class="logo" href={resolve('/')}>
			<h1 class="header-title">{i18nStore.t('title')}</h1>
		</a>
		<span class="header-subtitle">{i18nStore.t('docs.title')}</span>
	</div>
	<div class="header-right">
		<a class="header-btn back-link" href={resolve('/')} title={i18nStore.t('docs.backToApp')}>
			<span class="material-symbols-outlined">arrow_back</span>
			<span class="back-label">{i18nStore.t('docs.backToApp')}</span>
		</a>
		<div class="header-divider"></div>
		<a
			class="header-btn"
			href={resolve(`/docs/${otherLang}/${slug || 'getting-started'}`)}
			title="Toggle Language"
			onclick={() => {
				settingsStore.language = otherLang;
			}}
		>
			{lang === 'ko' ? 'EN' : '한'}
		</a>
		<button
			class="header-btn"
			type="button"
			onclick={() => themeStore.toggle()}
			title={i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')}
		>
			{themeStore.current === 'dark' ? '☀' : '☽'}
		</button>
	</div>
</header>

<style>
	/* Mirrors src/lib/components/Header.svelte so docs feel like the same app. */
	.header {
		height: var(--header-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		width: 100%;
		background: var(--sidebar-icon-bg);
		flex-shrink: 0;
		border-bottom: 1px solid var(--ghost-border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 32px;
	}

	.logo {
		display: inline-flex;
		align-items: baseline;
		text-decoration: none;
	}

	.header-title {
		font-size: 18px;
		font-weight: 700;
		color: var(--accent);
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		margin: 0;
	}

	.header-subtitle {
		font-size: 13px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		text-decoration: none;
		cursor: pointer;
		font-family: var(--font-body);
		transition:
			background-color var(--transition),
			color var(--transition);
	}

	.header-btn :global(.material-symbols-outlined) {
		font-size: 18px;
	}

	.header-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.back-link {
		gap: 6px;
		padding: 4px 8px;
	}

	.back-label {
		font-size: 12px;
		font-weight: 700;
	}

	.header-divider {
		width: 1px;
		height: 20px;
		background: var(--ghost-border);
	}

	.menu-btn {
		display: none;
	}

	@media (max-width: 960px) {
		.menu-btn {
			display: inline-flex;
		}
		.back-label {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.header {
			padding: 0 12px;
		}
		.header-left {
			gap: 16px;
		}
		.header-subtitle {
			display: none;
		}
	}
</style>
