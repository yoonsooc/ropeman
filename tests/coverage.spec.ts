import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-coverage';
const BROKEN_DIR = '/tmp/ropeman-coverage-broken';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.mkdirSync(path.join(DIR, 'scripts'), { recursive: true });
	// Ten outlines of about 1.5 KB each: a 5 KB budget fits three of them
	for (let i = 0; i < 10; i++) {
		const body = Array.from(
			{ length: 30 },
			(_, j) => `def handle_request_${String(i).padStart(2, '0')}_${j}():\n    pass\n`
		).join('\n');
		fs.writeFileSync(path.join(DIR, 'src', `service_${String(i).padStart(2, '0')}.py`), body);
	}
	// Read by the parser but excluded from the analysis by its path
	fs.writeFileSync(path.join(DIR, 'scripts', 'release.py'), 'def release():\n    pass\n');
	// No parser for this type
	fs.writeFileSync(path.join(DIR, 'notes.txt'), 'todo\n');

	fs.mkdirSync(path.join(BROKEN_DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(BROKEN_DIR, 'src', 'app.py'), 'def run():\n    pass\n');
	fs.writeFileSync(path.join(BROKEN_DIR, 'src', 'broken.py'), 'def (:\n  )))) class\n {{{{\n');
});

async function openProject(page: Page, settings: Record<string, unknown>, dir = DIR) {
	await page.addInitScript((s) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify(s));
	}, settings);
	await page.goto(`/?testDir=${encodeURIComponent(dir)}`);
	await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
}

test('summarizes what the analysis sends and lists what it leaves out', async ({ page }) => {
	await openProject(page, { language: 'en', maxSkeletonKB: 5 });

	const summary = page.getByTestId('coverage-summary');
	await expect(summary).toHaveText(/Sent 3 of 11 read files · 2 skipped/);

	await summary.click();
	const panel = page.getByTestId('coverage-panel');
	await expect(panel).toBeVisible();
	await expect(page.getByTestId('coverage-group-sent')).toContainText('3');
	await expect(page.getByTestId('coverage-group-not-sent')).toContainText('7');
	await expect(page.getByTestId('coverage-group-skipped')).toContainText('2');

	// The panel opens on the first group that left files out
	const rows = page.getByTestId('coverage-rows');
	await expect(rows.locator('li')).toHaveCount(7);
	await expect(rows).toContainText('Over the code summary size limit');

	await page.getByTestId('coverage-group-skipped').click();
	await expect(rows).toContainText('notes.txt');
	await expect(rows).toContainText('No parser for this file type');
	await expect(rows).toContainText('scripts/release.py');

	await panel.getByRole('searchbox').fill('notes');
	await expect(rows.locator('li')).toHaveCount(1);

	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();
});

test('sends every read file when the budget is unlimited', async ({ page }) => {
	await openProject(page, { language: 'ko', skeletonUnlimited: true });

	await expect(page.getByTestId('coverage-summary')).toHaveText(
		/파일 11개 중 10개를 AI에 보냄 · 2개 건너뜀/
	);
});

test('lists a file whose syntax the parser could not read as a parser error', async ({ page }) => {
	await openProject(page, { language: 'en' }, BROKEN_DIR);

	await page.getByTestId('coverage-summary').click();

	await expect(page.getByTestId('coverage-group-failed')).toContainText('1');
	const rows = page.getByTestId('coverage-rows');
	await expect(rows).toContainText('src/broken.py');
	await expect(rows).toContainText('Parser error');
});

test('reports how the code map resolved the imports, configs included', async ({ page }) => {
	// The two workspace packages and the tsconfig paths in this fixture only resolve when the
	// loader passes the package.json and tsconfig files on to the code map
	await openProject(page, { language: 'en' }, path.resolve('tests/fixtures/graphs/ts-monorepo'));

	await page.getByTestId('coverage-summary').click();

	await expect(page.getByTestId('coverage-imports')).toHaveText(
		'Of 18 import statements, 17 lead to project files, 1 to packages, and 0 to nothing found.'
	);
});
