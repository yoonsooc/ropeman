import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from './support/app';

const SKILL_URL =
	'https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.3.0/skill/ropeman/SKILL.md';

async function useLanguage(page: Page, language: 'en' | 'ko') {
	await page.addInitScript((lang) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: lang }));
	}, language);
}

test.describe('First use from a coding agent', { tag: '@responsive' }, () => {
	test('the landing leads with the three setup steps and fits the screen', async ({ page }) => {
		await useLanguage(page, 'en');
		await gotoApp(page);

		const setup = page.locator('#agent-setup');
		await expect(setup.getByRole('heading', { name: 'Set it up in three steps' })).toBeVisible();
		await expect(setup.getByTestId('install-command')).toHaveText(
			'npm install -g @ropeman/bridge@0.3.0'
		);
		await expect(setup.getByTestId('skill-command')).toHaveText(
			`curl --create-dirs -fsSLo ~/.claude/skills/ropeman/SKILL.md ${SKILL_URL}`
		);
		await expect(setup.getByTestId('agent-support')).toContainText('Tested with Claude Code.');
		await expect(setup.getByTestId('connect-hint').getByRole('link')).toHaveAttribute(
			'href',
			'/bridge'
		);
		// The in-browser path stays on the page as the second option
		await expect(
			page.getByRole('heading', { name: 'Or try it in the browser, no install' })
		).toBeVisible();
		await expect(page.locator('.github-input')).toBeVisible();

		const overflows = await page.evaluate(() => {
			const scroller = document.querySelector('.dropzone')!;
			return scroller.scrollWidth > scroller.clientWidth;
		});
		expect(overflows, 'no sideways scroll on the landing').toBe(false);
	});

	test('each agent tab shows its own skills folder and says what was not tested', async ({
		page
	}) => {
		await useLanguage(page, 'en');
		await gotoApp(page);
		const setup = page.locator('#agent-setup');
		const folders = {
			Codex: '~/.agents/skills',
			'Gemini CLI': '~/.gemini/skills',
			Cursor: '~/.cursor/skills'
		};

		for (const [agent, folder] of Object.entries(folders)) {
			await setup.getByRole('tab', { name: agent }).click();

			await expect(setup.getByRole('tab', { name: agent })).toHaveAttribute(
				'aria-selected',
				'true'
			);
			await expect(setup.getByTestId('skill-command')).toHaveText(
				`curl --create-dirs -fsSLo ${folder}/ropeman/SKILL.md ${SKILL_URL}`
			);
			await expect(setup.getByTestId('agent-support')).toContainText(
				`Ropeman has not been tested with ${agent} yet.`
			);
			await expect(setup.getByTestId('agent-support').getByRole('link')).toHaveAttribute(
				'target',
				'_blank'
			);
		}
	});

	test('the agent tabs move with the arrow keys', async ({ page }) => {
		await useLanguage(page, 'en');
		await gotoApp(page);
		const setup = page.locator('#agent-setup');

		await setup.getByRole('tab', { name: 'Claude Code' }).focus();
		await page.keyboard.press('ArrowLeft');

		await expect(setup.getByRole('tab', { name: 'Cursor' })).toBeFocused();
		await expect(setup.getByTestId('skill-command')).toContainText('~/.cursor/skills');
		await page.keyboard.press('ArrowRight');
		await expect(setup.getByRole('tab', { name: 'Claude Code' })).toBeFocused();
		await expect(setup.getByTestId('agent-support')).toContainText('Tested with Claude Code.');
	});

	test('Korean shows the same steps with the untested note in Korean', async ({ page }) => {
		await useLanguage(page, 'ko');
		await gotoApp(page);
		const setup = page.locator('#agent-setup');

		await expect(setup.getByRole('heading', { name: '세 단계로 시작하기' })).toBeVisible();
		await setup.getByRole('tab', { name: 'Gemini CLI' }).click();

		await expect(setup.getByTestId('agent-support')).toContainText(
			'Ropeman은 Gemini CLI에서 아직 테스트하지 않았습니다.'
		);
		await expect(setup.getByTestId('skill-command')).toContainText('~/.gemini/skills');
	});

	test('/bridge offers the agent setup before serve is connected', async ({ page }) => {
		await useLanguage(page, 'en');
		await page.goto('/bridge');
		const agent = page.getByTestId('bridge-agent-setup');

		await expect(agent).not.toHaveAttribute('open');
		await agent.getByText('With a coding agent, the agent starts serve for you').click();

		await expect(agent.getByTestId('install-command')).toBeVisible();
		await expect(agent.getByTestId('skill-command')).toContainText('~/.claude/skills');
		// This page is the connection page, so the step does not link back to it
		await expect(agent.getByTestId('connect-hint')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
		await expect(page.getByTestId('bridge-start-command')).toHaveText(
			'npm install -g @ropeman/bridge@0.3.0\nropeman serve --root .'
		);
	});
});

test('copy puts the exact command on the clipboard', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await useLanguage(page, 'en');
	await gotoApp(page);
	const setup = page.locator('#agent-setup');

	await setup.getByRole('tab', { name: 'Codex' }).click();
	const button = setup.getByRole('button', { name: 'Copy skill command for Codex' });
	await button.click();

	await expect(button).toHaveText(/Copied/);
	// The announcement lives outside the button, so the button keeps its name while it changes
	await expect(page.getByTestId('copy-status')).toHaveText('Copied the skill command for Codex.');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		`curl --create-dirs -fsSLo ~/.agents/skills/ropeman/SKILL.md ${SKILL_URL}`
	);
});

test('each copy button names the command it copies', async ({ page }) => {
	await useLanguage(page, 'ko');
	await gotoApp(page);
	const setup = page.locator('#agent-setup');

	await expect(setup.getByRole('button', { name: '설치 명령 복사' })).toBeVisible();
	await setup.getByRole('tab', { name: 'Cursor' }).click();
	await expect(setup.getByRole('button', { name: 'Cursor용 스킬 명령 복사' })).toBeVisible();
});

test('a blocked clipboard selects the command and says to copy it by hand', async ({ page }) => {
	await useLanguage(page, 'en');
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }
		});
	});
	await gotoApp(page);
	const setup = page.locator('#agent-setup');

	await setup.getByRole('button', { name: 'Copy install command' }).click();

	await expect(setup.getByTestId('copy-failed')).toHaveText(
		"Couldn't copy to the clipboard. The command is selected, so copy it with Ctrl+C or ⌘C."
	);
	await expect(page.getByTestId('copy-status')).toHaveText(/Couldn't copy/);
	expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
		'npm install -g @ropeman/bridge@0.3.0'
	);
});

test('Tab moves from the selected agent tab into its panel', async ({ page }) => {
	await useLanguage(page, 'en');
	await gotoApp(page);
	const setup = page.locator('#agent-setup');

	await setup.getByRole('tab', { name: 'Claude Code' }).focus();
	await page.keyboard.press('Tab');

	await expect(setup.getByRole('tabpanel', { name: 'Claude Code' })).toBeFocused();
});

test('a first visit does not start the browser-path tour over the setup steps', async ({
	page
}) => {
	await gotoApp(page);
	await expect(page.locator('#agent-setup')).toBeVisible();

	await page.waitForTimeout(1200);

	await expect(page.locator('.tour-overlay')).toHaveCount(0);
});
