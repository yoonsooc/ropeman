<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import {
		openDirectory,
		readDirectoryRecursive,
		handleFallbackInput
	} from '$lib/services/fileSystemService';
	import { parseAllFiles } from '$lib/services/parserService';
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import HeroIllustration from './HeroIllustration.svelte';
	import { parseGitHubUrl } from '$lib/utils/githubUrl';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';

	const breakpoint = useBreakpoint();
	// M4: File System Access API + directory drag are desktop-only. On phones
	// and tablets we redirect users to the GitHub URL path.
	const isCompact = $derived(breakpoint.isMobile || breakpoint.isTablet);

	let { oncancel, onload }: { oncancel?: () => void; onload?: () => void } = $props();

	const languages = [
		{
			name: 'Python',
			color: '#3572A5',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.42 3.35-3.42h5.766s3.24.052 3.24-3.148V3.202S18.28 0 11.914 0zM8.708 1.85c.578 0 1.046.47 1.046 1.052 0 .581-.468 1.051-1.046 1.051-.579 0-1.047-.47-1.047-1.051 0-.582.468-1.052 1.047-1.052z"/><path fill="currentColor" d="M12.087 24c6.093 0 5.713-2.656 5.713-2.656l-.007-2.752h-5.814v-.826h8.123S24 18.211 24 12.031c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.42-3.35 3.42H9.45s-3.24-.052-3.24 3.148v5.292S5.72 24 12.087 24zm3.206-1.85c-.578 0-1.046-.47-1.046-1.052 0-.581.468-1.051 1.046-1.051.579 0 1.047.47 1.047 1.051 0 .582-.468 1.052-1.047 1.052z"/></svg>`
		},
		{
			name: 'JavaScript',
			color: '#f1e05a',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.405-.6-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z"/></svg>`
		},
		{
			name: 'TypeScript',
			color: '#3178c6',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z"/></svg>`
		},
		{
			name: 'Java',
			color: '#b07219',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.762.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0-.001-8.216 2.051-4.292 6.573M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.887 9.58 1.553 17.462-.7 14.977-1.82M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892M17.116 17.584c4.503-2.34 2.421-4.589.968-4.285-.355.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.928 4.562 0 0 .07-.062.09-.118M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.889 4.832 0 6.836-2.274-2.053-3.943-3.858-2.824-5.539 1.644-2.469 6.197-3.665 5.189-7.627M9.734 23.924c4.322.277 10.959-.154 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0 0 .553.457 3.393.639"/></svg>`
		},
		{
			name: 'Go',
			color: '#00ADD8',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 0 1 .292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 0 1-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2M18.872 16.264c-1.052-.023-2.02-.304-2.853-.97a4.186 4.186 0 0 1-1.52-2.814c-.187-1.332.152-2.548.947-3.62.853-1.145 1.986-1.87 3.39-2.092 1.18-.187 2.291-.058 3.283.655.898.643 1.484 1.497 1.66 2.594.222 1.425-.152 2.676-1.098 3.773-.795.923-1.823 1.52-3.013 1.776-.362.07-.724.105-1.098.117l.303-.42z"/></svg>`
		},
		{
			name: 'Rust',
			color: '#dea584',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M23.8346 11.7033l-1.0073-.6236a13.7268 13.7268 0 00-.0283-.2936l.8656-.8069a.3483.3483 0 00-.1154-.578l-1.1066-.414a8.4958 8.4958 0 00-.087-.2856l.6904-.9587a.3462.3462 0 00-.2257-.5446l-1.1663-.1894a9.3574 9.3574 0 00-.1407-.2622l.49-1.0761a.3437.3437 0 00-.0274-.3361.3486.3486 0 00-.3006-.154l-1.1845.0416a6.7444 6.7444 0 00-.1873-.2268l.2723-1.153a.3472.3472 0 00-.417-.4172l-1.1532.2724a14.0183 14.0183 0 00-.2278-.1873l.0415-1.1845a.3442.3442 0 00-.49-.328l-1.076.491c-.0872-.0476-.1742-.0952-.2623-.1407l-.1903-1.1673A.3483.3483 0 0016.256.955l-.9597.6905a8.4867 8.4867 0 00-.2855-.086l-.414-1.1066a.3483.3483 0 00-.5781-.1154l-.8069.8666a9.2936 9.2936 0 00-.2936-.0284L12.2946.1683a.3462.3462 0 00-.5892 0l-.6236 1.0073a13.7383 13.7383 0 00-.2936.0284L9.9803.3374a.3462.3462 0 00-.578.1154l-.4141 1.1065c-.0962.0274-.1903.0567-.2855.086L7.744.955a.3483.3483 0 00-.5447.2258L7.009 2.348a9.3574 9.3574 0 00-.2622.1407l-1.0762-.491a.3462.3462 0 00-.49.328l.0416 1.1845a7.9826 7.9826 0 00-.2278.1873L3.8413 3.425a.3472.3472 0 00-.4171.4171l.2713 1.1531c-.0628.075-.1255.1509-.1863.2268l-1.1845-.0415a.3462.3462 0 00-.328.49l.491 1.0761a9.167 9.167 0 00-.1407.2622l-1.1662.1894a.3483.3483 0 00-.2258.5446l.6904.9587a13.303 13.303 0 00-.087.2855l-1.1065.414a.3483.3483 0 00-.1155.5781l.8656.807a9.2936 9.2936 0 00-.0283.2935l-1.0073.6236a.3442.3442 0 000 .5892l1.0073.6236c.008.0982.0182.1964.0283.2936l-.8656.8079a.3462.3462 0 00.1155.578l1.1065.4141c.0273.0962.0567.1914.087.2855l-.6904.9587a.3452.3452 0 00.2268.5447l1.1662.1893c.0456.088.0922.1751.1408.2622l-.491 1.0762a.3462.3462 0 00.328.49l1.1834-.0415c.0618.0769.1235.1528.1873.2277l-.2713 1.1541a.3462.3462 0 00.4171.4161l1.153-.2713c.075.0638.151.1255.2279.1863l-.0415 1.1845a.3442.3442 0 00.49.327l1.0761-.49c.087.0486.1741.0951.2622.1407l.1903 1.1662a.3483.3483 0 00.5447.2268l.9587-.6904a9.299 9.299 0 00.2855.087l.414 1.1066a.3452.3452 0 00.5781.1154l.8079-.8656c.0972.0111.1954.0203.2936.0294l.6236 1.0073a.3472.3472 0 00.5892 0l.6236-1.0073c.0982-.0091.1964-.0183.2936-.0294l.8069.8656a.3483.3483 0 00.578-.1154l.4141-1.1066a8.4626 8.4626 0 00.2855-.087l.9587.6904a.3452.3452 0 00.5447-.2268l.1903-1.1662c.088-.0456.1751-.0931.2622-.1407l1.0762.49a.3472.3472 0 00.49-.327l-.0415-1.1845a6.7267 6.7267 0 00.2267-.1863l1.1531.2713a.3472.3472 0 00.4171-.416l-.2713-1.1542c.0628-.0749.1255-.1508.1863-.2278l1.1845.0415a.3442.3442 0 00.328-.49l-.49-1.076c.0475-.0872.0951-.1742.1407-.2623l1.1662-.1893a.3483.3483 0 00.2258-.5447l-.6904-.9587.087-.2855 1.1066-.414a.3462.3462 0 00.1154-.5781l-.8656-.8079c.0101-.0972.0202-.1954.0283-.2936l1.0073-.6236a.3442.3442 0 000-.5892zm-6.7413 8.3551a.7138.7138 0 01.2986-1.396.714.714 0 11-.2997 1.396zm-.3422-2.3142a.649.649 0 00-.7715.5l-.3573 1.6685c-1.1035.501-2.3285.7795-3.6193.7795a8.7368 8.7368 0 01-3.6951-.814l-.3574-1.6684a.648.648 0 00-.7714-.499l-1.473.3158a8.7216 8.7216 0 01-.7613-.898h7.1676c.081 0 .1356-.0141.1356-.088v-2.536c0-.074-.0536-.0881-.1356-.0881h-2.0966v-1.6077h2.2677c.2065 0 1.1065.0587 1.394 1.2088.0901.3533.2875 1.5044.4232 1.8729.1346.413.6833 1.2381 1.2685 1.2381h3.5716a.7492.7492 0 00.1296-.0131 8.7874 8.7874 0 01-.8119.9526zM6.8369 20.024a.714.714 0 11-.2997-1.396.714.714 0 01.2997 1.396zM4.1177 8.9972a.7137.7137 0 11-1.304.5791.7137.7137 0 011.304-.579zm-.8352 1.9813l1.5347-.6824a.65.65 0 00.33-.8585l-.3158-.7147h1.2432v5.6025H3.5669a8.7753 8.7753 0 01-.2834-3.348zm6.7343-.5437V8.7836h2.9601c.153 0 1.0792.1772 1.0792.8697 0 .575-.7107.7815-1.2948.7815zm10.7574 1.4862c0 .2187-.008.4363-.0243.651h-.9c-.09 0-.1265.0586-.1265.1477v.413c0 .973-.5487 1.1846-1.0296 1.2382-.4576.0517-.9648-.1913-1.0275-.4717-.2704-1.5186-.7198-1.8436-1.4305-2.4034.8817-.5599 1.799-1.386 1.799-2.4915 0-1.1936-.819-1.9458-1.3769-2.3153-.7825-.5163-1.6491-.6195-1.883-.6195H5.4682a8.7651 8.7651 0 014.907-2.7699l1.0974 1.151a.648.648 0 00.9182.0213l1.227-1.1743a8.7753 8.7753 0 016.0044 4.2762l-.8403 1.8982a.652.652 0 00.33.8585l1.6178.7188c.0283.2875.0425.577.0425.8717zm-9.3006-9.5993a.7128.7128 0 11.984 1.0316.7137.7137 0 01-.984-1.0316zm8.3389 6.71a.7107.7107 0 01.9395-.3625.7137.7137 0 11-.9405.3635z"/></svg>`
		},
		{
			name: 'C/C++',
			color: '#555555',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M22.394 6c-.167-.29-.398-.543-.652-.69L12.926.22c-.509-.294-1.34-.294-1.848 0L2.26 5.31c-.508.293-.923 1.013-.923 1.6v10.18c0 .294.104.62.271.91.167.29.398.543.652.69l8.816 5.09c.508.293 1.34.293 1.848 0l8.816-5.09c.254-.147.485-.4.652-.69.167-.29.27-.616.27-.91V6.91c.003-.294-.1-.62-.268-.91zM12 19.11c-3.92 0-7.109-3.19-7.109-7.11 0-3.92 3.19-7.11 7.11-7.11a7.133 7.133 0 0 1 6.156 3.553l-3.076 1.78a3.567 3.567 0 0 0-3.08-1.78A3.56 3.56 0 0 0 8.444 12 3.56 3.56 0 0 0 12 15.555a3.57 3.57 0 0 0 3.08-1.778l3.078 1.78A7.135 7.135 0 0 1 12 19.11zm7.11-6.715h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79zm2.962 0h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79z"/></svg>`
		},
		{
			name: 'Ruby',
			color: '#CC342D',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.156.083c3.033.525 3.893 2.598 3.829 4.77L24 4.822 22.635 22.71 4.89 23.926h.016C3.433 23.864.15 23.729 0 19.139l1.645-3 2.819 6.586.503 1.172 2.805-9.144-.03.007.016-.03 9.255 2.956-1.396-5.431-.99-3.9 8.82-.569-.615-.51L16.5 2.114 20.159.073l-.003.01zM0 19.089zM5.13 5.073c3.561-3.533 8.157-5.621 9.922-3.84 1.762 1.777-.105 6.105-3.673 9.636-3.563 3.532-8.103 5.734-9.864 3.957-1.766-1.777.045-6.217 3.612-9.75l.003-.003z"/></svg>`
		}
	];

	let isDragOver = $state(false);
	let error = $state('');
	let fallbackInput = $state<HTMLInputElement>(null!);
	let githubUrl = $state('');
	let isLoadingGithub = $state(false);

	const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		error = '';

		try {
			const items = e.dataTransfer?.items;
			if (!items || items.length === 0) return;

			const item = items[0];

			// Try File System Access API (Chromium)
			if ('getAsFileSystemHandle' in item) {
				const handle = await (item as any).getAsFileSystemHandle();
				if (handle?.kind === 'directory') {
					await loadFromDirectoryHandle(handle as FileSystemDirectoryHandle);
					return;
				}
			}

			// Fallback: check for files via webkitGetAsEntry
			const entry = item.webkitGetAsEntry?.();
			if (entry?.isDirectory) {
				error =
					'Drag & drop directory reading requires a Chromium browser. Please use the "Open Directory" button instead.';
				return;
			}

			error = 'Please drop a folder, not individual files.';
		} catch (err) {
			error = `Failed to read directory: ${err}`;
		}
	}

	async function handleOpenDirectory() {
		error = '';

		if (supportsDirectoryPicker) {
			try {
				const dirHandle = await openDirectory();
				await loadFromDirectoryHandle(dirHandle);
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					error = `Failed to open directory: ${err.message}`;
				}
			}
		} else {
			// Trigger fallback file input
			fallbackInput?.click();
		}
	}

	function resetStores() {
		projectStore.reset();
		graphStore.clear();
		selectionStore.clear();
		semanticStore.clear();
	}

	async function handleFallbackFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		error = '';
		try {
			resetStores();
			const tree = handleFallbackInput(input.files);
			projectStore.projectName = tree.name;
			projectStore.fileTree = tree;
			projectStore.isLoading = true;
			const astMap = await parseAllFiles(tree, projectStore.astMap, (progress) => {
				projectStore.parsingProgress = progress;
			});
			projectStore.astMap = astMap;
			projectStore.isLoading = false;
		} catch (err) {
			error = `Failed to process files: ${err}`;
			projectStore.isLoading = false;
		}
	}

	async function handleGitHubLoad() {
		error = '';
		const parsed = parseGitHubUrl(githubUrl);
		if (!parsed) {
			error = i18nStore.t('landing.githubInvalidUrl');
			return;
		}

		isLoadingGithub = true;
		error = '';

		try {
			resetStores();
			projectStore.projectName = parsed.repo;
			const { loadGitHubRepo } = await import('$lib/services/githubLoader');
			await loadGitHubRepo(parsed);
			onload?.();
		} catch (err: any) {
			resetStores();
			const status = err?.status;
			if (status === 404) {
				error = i18nStore.t('landing.githubNotFound');
			} else if (status === 403) {
				error = i18nStore.t('landing.githubRateLimit');
			} else if (status === 401) {
				error = i18nStore.t('landing.githubPrivate');
			} else {
				error = i18nStore.t('landing.githubLoadError');
			}
		} finally {
			isLoadingGithub = false;
		}
	}

	function handleGitHubKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleGitHubLoad();
		}
	}

	async function loadFromDirectoryHandle(dirHandle: FileSystemDirectoryHandle) {
		resetStores();
		projectStore.isLoading = true;
		projectStore.projectName = dirHandle.name;
		onload?.();

		const tree = await readDirectoryRecursive(dirHandle);
		projectStore.fileTree = tree;

		const astMap = await parseAllFiles(tree, projectStore.astMap, (progress) => {
			projectStore.parsingProgress = progress;
		});
		projectStore.astMap = astMap;
		projectStore.isLoading = false;
	}
</script>

<div
	class="dropzone"
	class:dragover={isDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="button"
	tabindex="0"
>
	{#if oncancel}
		<button class="dropzone-close" onclick={oncancel} title="Cancel">
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	{/if}
	<div class="dropzone-content">
		{#if projectStore.isLoading}
			<div class="loading-state">
				<div class="loading-card">
					<div class="loading-spinner-container">
						<div class="loading-ring"></div>
						<span class="material-symbols-outlined loading-icon">refresh</span>
					</div>
					<div class="loading-text">
						<h2>Project Loading</h2>
						{#if projectStore.parsingProgress.total > 0}
							<p class="progress">
								Parsing project... <span class="progress-count"
									>{projectStore.parsingProgress.done}/{projectStore.parsingProgress.total}</span
								> files
							</p>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="landing" class:mobile={isCompact}>
				<section class="landing-hero">
					<div class="hero-text">
						<h1>{@html i18nStore.t('landing.headline')}</h1>
						<p class="hero-sub">{i18nStore.t('landing.subheadline')}</p>
						{#if !isCompact}
							<button class="cta-btn" data-tour-step="1" onclick={handleOpenDirectory}>
								<span class="material-symbols-outlined cta-icon">folder_open</span>
								{i18nStore.t('landing.cta')}
							</button>
							<p class="drag-hint">{i18nStore.t('landing.dragHint')}</p>
						{:else}
							<p class="mobile-folder-hint">
								<span class="material-symbols-outlined">info</span>
								{i18nStore.t('landing.mobileFolderHint')}
							</p>
						{/if}
						<div class="github-input-section">
							<p class="github-or">
								{isCompact
									? i18nStore.t('landing.mobileGithubLead')
									: i18nStore.t('landing.githubOr')}
							</p>
							<div class="github-input-row">
								<input
									type="text"
									class="github-input"
									placeholder={i18nStore.t('landing.githubPlaceholder')}
									bind:value={githubUrl}
									onkeydown={handleGitHubKeydown}
									disabled={isLoadingGithub}
								/>
								<button
									class="github-load-btn"
									onclick={handleGitHubLoad}
									disabled={isLoadingGithub || !githubUrl.trim()}
								>
									{#if isLoadingGithub}
										<span class="material-symbols-outlined github-spinner">progress_activity</span>
									{:else}
										<span class="material-symbols-outlined">play_arrow</span>
									{/if}
									{i18nStore.t('landing.githubLoad')}
								</button>
							</div>
						</div>
						<a class="explore-card" href={resolve('/explore')} data-tour-step="explore">
							<div class="explore-card-accent"></div>
							<div class="explore-card-inner">
								<div class="explore-card-icon">
									<span class="material-symbols-outlined">photo_library</span>
								</div>
								<div class="explore-card-text">
									<span class="explore-card-eyebrow">
										{i18nStore.t('landing.exploreCardEyebrow')}
									</span>
									<h3 class="explore-card-title">
										{i18nStore.t('landing.exploreCardTitle')}
									</h3>
								</div>
								<div class="explore-card-cta">
									{i18nStore.t('landing.exploreCardCta')}
									<span class="material-symbols-outlined">arrow_forward</span>
								</div>
							</div>
						</a>
						<div class="hero-languages">
							{#each languages as lang}
								<span class="hero-lang" style="color: {lang.color}">
									{@html lang.icon}
								</span>
							{/each}
						</div>
						{#if error}
							<p class="error-msg">{error}</p>
						{/if}
					</div>
					<div class="hero-visual">
						<HeroIllustration />
					</div>
				</section>

				<!-- Technical Specs Strip (Stitch v2) -->
				<div class="landing-specs-strip">
					<div class="specs-item">
						<span class="material-symbols-outlined">verified_user</span>
						<span>{i18nStore.t('landing.specLocalFirst')}</span>
					</div>
					<div class="specs-item">
						<span class="material-symbols-outlined">memory</span>
						<span>{i18nStore.t('landing.specWebgpu')}</span>
					</div>
					<div class="specs-item">
						<span class="material-symbols-outlined">psychology</span>
						<span>{i18nStore.t('landing.specSemantic')}</span>
					</div>
					<div class="specs-item">
						<span class="material-symbols-outlined">visibility_off</span>
						<span>{i18nStore.t('landing.specNoData')}</span>
					</div>
				</div>

				<section class="landing-features">
					<div class="feature-card">
						<span class="material-symbols-outlined feature-mat-icon" style="color: var(--accent)"
							>psychology</span
						>
						<h3>{i18nStore.t('landing.featureAiTitle')}</h3>
						<p>{i18nStore.t('landing.featureAiDesc')}</p>
					</div>
					<div class="feature-card">
						<span
							class="material-symbols-outlined feature-mat-icon"
							style="color: var(--accent-secondary)">account_tree</span
						>
						<h3>{i18nStore.t('landing.featureDrillTitle')}</h3>
						<p>{i18nStore.t('landing.featureDrillDesc')}</p>
					</div>
					<div class="feature-card">
						<span
							class="material-symbols-outlined feature-mat-icon"
							style="color: var(--accent-tertiary)">hub</span
						>
						<h3>{i18nStore.t('landing.featureBrowserTitle')}</h3>
						<p>{i18nStore.t('landing.featureBrowserDesc')}</p>
					</div>
				</section>

				<!-- SnippetEditor hidden from landing — available via direct URL -->

				<footer class="landing-footer">
					<span class="footer-copy">&copy; 2026 Ropeman. All rights reserved.</span>
					<a class="footer-link" href={resolve('/explore')}>
						{i18nStore.locale === 'ko' ? '갤러리' : 'Explore'}
					</a>
					<a class="footer-link" href={resolve(`/docs/${i18nStore.locale}/getting-started`)}>
						{i18nStore.t('docs.footerLink')}
					</a>
					<a class="footer-link" href="mailto:contact@ropeman.dev">contact@ropeman.dev</a>
				</footer>
			</div>
		{/if}
	</div>
</div>

<!-- Hidden fallback input for non-Chromium browsers -->
{#if !supportsDirectoryPicker}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<input
		bind:this={fallbackInput}
		type="file"
		webkitdirectory
		multiple
		hidden
		onchange={handleFallbackFiles}
	/>
{/if}

<style>
	.dropzone {
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		position: relative;
		border: none;
		transition: all 0.2s ease;
		overflow-y: auto;
		overflow-x: hidden;
		background-color: var(--bg-primary);
	}

	.dropzone-close {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		color: var(--text-secondary);
		cursor: pointer;
		z-index: 1;
	}

	.dropzone-close:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	/* Show the standard "copy" cursor ONLY while an actual drag is in progress,
	   so idle hover over body text behaves normally. */
	.dropzone.dragover {
		background-color: color-mix(in srgb, var(--accent) 5%, transparent);
		cursor: copy;
	}

	.dropzone-content {
		width: 100%;
		max-width: var(--landing-max-width);
		margin-top: 48px;
		margin-bottom: 64px;
		padding: 0 24px;
		color: var(--text-secondary);
	}

	/* Landing layout */
	.landing {
		position: relative;
		animation: fadeInUp 0.5s ease both;
	}

	/* Radial glow backdrop spans the whole landing, not just hero, so the
	   hero section blends seamlessly with the page background (Stitch v2). */
	.landing::before,
	.landing::after {
		content: '';
		position: absolute;
		pointer-events: none;
		border-radius: 50%;
		filter: blur(120px);
		z-index: 0;
	}

	.landing::before {
		top: -5%;
		left: -10%;
		width: 500px;
		height: 500px;
		background: color-mix(in srgb, var(--accent, #a3a6ff) 5%, transparent);
	}

	.landing::after {
		top: 40%;
		right: -15%;
		width: 600px;
		height: 600px;
		background: color-mix(in srgb, var(--accent-secondary, #53ddfc) 5%, transparent);
	}

	.landing > * {
		position: relative;
		z-index: 1;
	}

	.landing-hero {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 64px;
		align-items: center;
		min-height: 500px;
		padding: 64px 48px;
		background: transparent;
	}

	.hero-text h1 {
		font-family: var(--font-display);
		font-size: 44px;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.2;
		letter-spacing: -0.01em;
		margin-bottom: 0;
	}

	.hero-text h1 :global(.headline-accent) {
		color: var(--accent);
	}

	.hero-sub {
		font-family: var(--font-body);
		font-size: 16px;
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 520px;
		margin-top: 16px;
		margin-bottom: 32px;
	}

	/* Click targets (buttons / icon rows / card CTA) should not behave like
	   selectable text — prevents accidental highlighting on click/drag while
	   leaving body copy (headline, subheadline, feature cards, footer) freely
	   selectable for a11y / copy-paste. */
	.cta-btn,
	.github-load-btn,
	.explore-card-cta,
	.hero-lang {
		-webkit-user-select: none;
		user-select: none;
	}

	.cta-btn {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 14px 28px;
		background: linear-gradient(135deg, var(--accent, #a3a6ff) 0%, #9396ff 100%);
		color: #ffffff;
		border-radius: 8px;
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		box-shadow:
			0 10px 20px -5px color-mix(in srgb, var(--accent) 30%, transparent),
			0 4px 6px -4px color-mix(in srgb, var(--accent) 20%, transparent);
		transition: all 0.15s ease;
	}

	.cta-btn:hover {
		opacity: 0.9;
	}

	.cta-btn:active {
		transform: scale(0.98);
	}

	.cta-icon {
		font-size: 24px;
	}

	.drag-hint {
		margin-top: 16px;
		margin-left: 8px;
		font-family: var(--font-code);
		font-size: 14px;
		color: var(--text-muted);
	}

	.mobile-folder-hint {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		padding: 10px 12px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: 8px;
	}

	.mobile-folder-hint .material-symbols-outlined {
		font-size: 18px;
		color: var(--accent);
	}

	/* Explore Gallery card — Stitch design "Ropeman Landing - Gallery Focus"
	   (.stitch-html/landing-gallery-focus.html) */
	.explore-card {
		position: relative;
		display: block;
		margin-top: 36px;
		margin-left: 8px;
		max-width: 640px;
		background: var(--bg-tertiary, #1b2028);
		border-radius: 12px;
		overflow: hidden;
		text-decoration: none;
		color: var(--text-primary);
		cursor: pointer;
		transition: background 0.3s ease;
	}

	.explore-card:hover {
		background: var(--bg-highest, #20262f);
	}

	.explore-card-accent {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--accent-secondary, #53ddfc);
	}

	.explore-card-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 20px 24px;
	}

	.explore-card-icon {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 8px;
		background: rgba(83, 221, 252, 0.1);
		color: var(--accent-secondary, #53ddfc);
	}

	.explore-card-icon .material-symbols-outlined {
		font-size: 22px;
	}

	.explore-card-text {
		flex: 1;
		min-width: 0;
	}

	.explore-card-eyebrow {
		display: block;
		margin-bottom: 4px;
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		color: var(--accent-secondary, #53ddfc);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.explore-card-title {
		margin: 0 0 4px;
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.explore-card-sub {
		margin: 0;
		font-family: var(--font-body, 'Inter', sans-serif);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.explore-card-cta {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		color: var(--accent-secondary, #53ddfc);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		transition: transform 0.3s ease;
	}

	.explore-card-cta .material-symbols-outlined {
		font-size: 16px;
	}

	.explore-card:hover .explore-card-cta {
		transform: translateX(4px);
	}

	/* Accent bar thickens on hover (Stitch v2 spec) */
	.explore-card:hover .explore-card-accent {
		width: 4px;
	}

	.explore-card-accent {
		transition: width 0.3s ease;
	}

	@media (max-width: 640px) {
		.explore-card {
			max-width: none;
		}
		.explore-card-inner {
			flex-direction: column;
			align-items: flex-start;
			gap: 16px;
		}
	}

	/* GitHub URL input */
	.github-input-section {
		margin-top: 36px;
	}

	.github-or {
		font-family: var(--font-code);
		font-size: 14px;
		color: var(--text-muted);
		margin-bottom: 8px;
	}

	.github-input-row {
		display: flex;
		gap: 8px;
		align-items: center;
		max-width: 448px;
	}

	.github-input {
		flex: 1;
		padding: 10px 14px;
		background: var(--bg-secondary);
		border: 1px solid var(--ghost-border);
		border-radius: 8px;
		color: var(--text-primary);
		font-family: var(--font-code);
		font-size: 14px;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.github-input:focus {
		border-color: var(--accent);
	}

	.github-input:disabled {
		opacity: 0.5;
	}

	.github-input::placeholder {
		color: var(--text-muted);
	}

	.github-load-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 10px 16px;
		background: var(--bg-secondary);
		border: 1px solid var(--ghost-border);
		border-radius: 8px;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.github-load-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.github-load-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.github-load-btn .material-symbols-outlined {
		font-size: 18px;
	}

	.github-spinner {
		animation: spin 0.8s linear infinite;
	}

	.hero-languages {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
		opacity: 0.5;
	}

	.hero-lang {
		display: flex;
		align-items: center;
	}

	.hero-lang :global(svg) {
		width: 18px;
		height: 18px;
	}

	.hero-visual {
		display: flex;
		justify-content: center;
	}

	/* Technical Specs Strip — Stitch v2 */
	.landing-specs-strip {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 32px;
		margin-top: 32px;
		padding: 24px 48px;
		border-top: 1px solid color-mix(in srgb, var(--text-muted, #64748b) 20%, transparent);
		background: color-mix(in srgb, var(--bg-secondary, #151a21) 40%, transparent);
		border-radius: 8px;
		opacity: 0.7;
	}

	.specs-item {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-display);
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-secondary);
	}

	.specs-item .material-symbols-outlined {
		font-size: 18px;
		color: var(--text-secondary, #53ddfc);
		opacity: 0.8;
	}

	/* Feature cards */
	.landing-features {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
		margin-top: 48px;
		margin-bottom: 80px;
	}

	/* Feature cards are informational only — no click handler, so avoid
	   hover affordances (pointer cursor, border highlight) that would
	   suggest otherwise. */
	.feature-card {
		background: var(--bg-secondary);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 32px;
		text-align: left;
	}

	.feature-mat-icon {
		font-size: 30px;
		margin-bottom: 16px;
		display: block;
	}

	.feature-card h3 {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 8px;
	}

	.feature-card p {
		font-family: var(--font-body);
		font-size: 14px;
		line-height: 1.625;
		color: var(--text-secondary);
	}

	.error-msg {
		margin-top: 12px;
		color: var(--color-error, #e53e3e);
		font-size: 13px;
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}

	.loading-card {
		background: rgba(27, 32, 40, 0.95);
		backdrop-filter: blur(12px);
		padding: 32px 40px;
		border-radius: 12px;
		border: 1px solid rgba(163, 166, 255, 0.2);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
	}

	.loading-spinner-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loading-ring {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: 2px solid rgba(163, 166, 255, 0.1);
		border-top-color: var(--accent, #a3a6ff);
		animation: spin 0.8s linear infinite;
	}

	.loading-icon {
		position: absolute;
		color: var(--accent, #a3a6ff);
		font-size: 30px;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.loading-text {
		text-align: center;
	}

	.loading-text h2 {
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 8px;
	}

	.progress {
		font-family: var(--font-code);
		font-size: 12px;
		color: rgba(163, 166, 255, 0.7);
		font-variant-numeric: tabular-nums;
	}

	.progress-count {
		color: var(--accent, #a3a6ff);
		font-weight: 700;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Responsive */
	@media (max-width: 720px) {
		.dropzone {
			padding: 24px 16px;
		}

		.landing-hero {
			grid-template-columns: 1fr;
			text-align: center;
			padding: 40px 24px;
		}

		.hero-text h1 {
			font-size: 32px;
		}

		.hero-sub {
			max-width: none;
		}

		.hero-visual {
			order: -1;
		}

		.landing-specs-strip {
			padding: 20px 24px;
			gap: 20px;
			justify-content: center;
		}

		.landing-features {
			grid-template-columns: 1fr;
		}
	}

	.landing-footer {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 16px;
		padding: 32px 0 24px;
		font-size: 11px;
		color: var(--text-muted);
	}

	.footer-copy {
		letter-spacing: 0.02em;
	}

	.footer-link {
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.15s;
	}

	.footer-link:hover {
		color: var(--accent);
	}
</style>
