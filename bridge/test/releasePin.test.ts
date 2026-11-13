import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(repo(path), 'utf8');

const { version } = JSON.parse(read('bridge/package.json')) as { version: string };

/** Every place that tells people how to install the command or the skill */
const SURFACES = [
	'README.md',
	'README-KO.md',
	'bridge/README.md',
	'skill/README.md',
	'skill/README-KO.md',
	'skill/ropeman/SKILL.md',
	'src/content/docs/en/getting-started.md',
	'src/content/docs/ko/getting-started.md',
	'src/content/docs/en/bridge-setup.md',
	'src/content/docs/ko/bridge-setup.md',
	'src/lib/components/AgentSetup.svelte',
	'src/lib/components/BridgeAccessGuide.svelte',
	'src/routes/bridge/+page.svelte'
];

const SKILL_URL =
	/raw\.githubusercontent\.com\/yoonsooc\/ropeman\/([^/\s]+)\/skill\/ropeman\/SKILL\.md/g;
const PACKAGE_COMMAND = /(npm install -g|npx) @ropeman\/bridge(@[\w.-]+)?/g;

describe('the skill URL and the install command name one release', () => {
	// Regression: the URL tracked main while people installed whatever npm had, so a newer
	// SKILL.md could call commands an older install lacks (PR #83 review)
	it('pins every skill URL to the bridge-v tag of bridge/package.json', () => {
		const refs = SURFACES.flatMap((path) =>
			[...read(path).matchAll(SKILL_URL)].map((m) => `${path}: ${m[1]}`)
		);

		expect(refs.length).toBeGreaterThanOrEqual(6);
		expect(refs.filter((ref) => !ref.endsWith(`: bridge-v${version}`))).toEqual([]);
	});

	it('installs and runs that same version wherever the package is named in a command', () => {
		const commands = SURFACES.flatMap((path) =>
			[...read(path).matchAll(PACKAGE_COMMAND)].map((m) => `${path}: ${m[0]}`)
		);

		expect(commands.length).toBeGreaterThanOrEqual(8);
		expect(commands.filter((command) => !command.endsWith(`@ropeman/bridge@${version}`))).toEqual(
			[]
		);
	});

	it('has SKILL.md step 1 ask for that version and install it', () => {
		const step1 = read('skill/ropeman/SKILL.md').split('## 1. Check the tool')[1].split('## 2.')[0];

		expect(step1).toContain(`It must print ${version} or later.`);
		expect(step1).toContain(`npm install -g @ropeman/bridge@${version}`);
	});
});
