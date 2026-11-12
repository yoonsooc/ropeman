import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-sfc';

const COUNTER = `<script lang="ts">
	import { onMount } from 'svelte';

	let count = $state(0);

	function increment() {
		count += 1;
	}

	onMount(increment);
</script>

<button onclick={increment}>{count}</button>

<style>
	button { padding: 4px; }
</style>
`;

const ITEM_LIST = `<template>
  <ul><li v-for="item in items" :key="item" @click="choose(item)">{{ item }}</li></ul>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const items = ref<string[]>([]);

function choose(item: string) {
  items.value = [item];
}
</script>
`;

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(DIR, 'src', 'Counter.svelte'), COUNTER);
	fs.writeFileSync(path.join(DIR, 'src', 'ItemList.vue'), ITEM_LIST);
	fs.writeFileSync(path.join(DIR, 'notes.txt'), 'todo\n');
});

test('reads the script blocks of .svelte and .vue files at their file lines', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem(
			'ropeman-settings',
			JSON.stringify({ language: 'en', skeletonUnlimited: true, showSymbols: true })
		);
	});
	await page.goto(`/?testDir=${encodeURIComponent(DIR)}`);
	await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });

	await expect(page.getByTestId('coverage-summary')).toHaveText(
		/Sent 2 of 2 read files · 1 skipped/
	);

	await page.locator('.tree-item.dir-item').first().click();
	await page.locator('.tree-item.dir-item', { hasText: 'src' }).click();

	await page.locator('.tree-item.file-item', { hasText: 'Counter.svelte' }).click();
	const increment = page.locator('.symbol-item', { hasText: 'increment' });
	await expect(increment.locator('.symbol-line')).toHaveText('L6');
	await expect(page.locator('.symbol-item', { hasText: "from 'svelte'" })).toContainText('L2');

	await page.locator('.tree-item.file-item', { hasText: 'ItemList.vue' }).click();
	const choose = page.locator('.symbol-item', { hasText: 'choose' });
	await expect(choose.locator('.symbol-line')).toHaveText('L10');
});
