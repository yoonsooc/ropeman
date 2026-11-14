import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	MAX_SNAPSHOT_BYTES,
	buildExploreSnapshot,
	checkSnapshot,
	namingGaps,
	parseMap,
	snapshotStats,
	translationFromList,
	translationSource
} from './exploreSnapshotBuilder';
import { validateSnapshot } from './exploreService';
import { MAX_BODY_SIZE } from '../../../edge-proxy/src/explore.limits';

const FIXTURE = fileURLToPath(
	new URL('../../../tests/fixtures/ropeman-map/ropeman.json', import.meta.url)
);
const map = () => parseMap(fs.readFileSync(FIXTURE, 'utf8'));
const COMMIT = 'a'.repeat(40);

const KO = {
	'sem:api': { label: 'HTTP API', description: '요청을 받아 상품과 주문을 처리한다.' },
	'sem:storage': { label: '저장소', description: '상품과 주문을 데이터베이스에 저장한다.' },
	'sem:ui': { label: '화면', description: '상점 화면을 그린다.' }
};

function build(ko = KO) {
	return buildExploreSnapshot(map(), { owner: 'acme', repo: 'shop', commit: COMMIT, ko });
}

describe('translationSource', () => {
	it('takes the parts the agent named and leaves out folder-named levels', () => {
		const source = translationSource(map());

		expect(Object.keys(source).sort()).toEqual(['sem:api', 'sem:storage', 'sem:ui']);
		expect(source['sem:api'].label).toBe('HTTP API');
	});
});

describe('translationFromList', () => {
	it('keys the model answer by id and trims it', () => {
		const out = translationFromList([{ id: 'sem:ui', label: ' 화면 ', description: '그린다. ' }]);

		expect(out).toEqual({ 'sem:ui': { label: '화면', description: '그린다.' } });
	});
});

describe('buildExploreSnapshot', () => {
	it('records the commit and keeps the levels English with Korean beside them', () => {
		const snapshot = build();

		expect(snapshot.commit).toBe(COMMIT);
		expect(snapshot.semanticLevels.__root__.nodes.map((n) => n.label)).toContain('HTTP API');
		expect(snapshot.translations?.ko?.['sem:storage'].label).toBe('저장소');
	});

	it('lists only the files that reached the map, relative to the repository root', () => {
		const snapshot = build();

		expect(snapshot.filePaths?.length).toBeGreaterThan(0);
		expect(snapshot.filePaths?.some((p) => p.includes('.env'))).toBe(false);
		expect(snapshot.filePaths?.every((p) => !p.startsWith('/') && !p.startsWith('shop/'))).toBe(
			true
		);
	});

	it('survives the viewer validator with every level and the translation', () => {
		const snapshot = build();

		const read = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));

		expect(Object.keys(read!.semanticLevels)).toEqual(Object.keys(snapshot.semanticLevels));
		expect(read!.translations?.ko).toEqual(KO);
		expect(read!.commit).toBe(COMMIT);
	});
});

describe('checkSnapshot', () => {
	it('allows exactly what the explore worker accepts', () => {
		expect(MAX_SNAPSHOT_BYTES).toBe(MAX_BODY_SIZE);
	});

	it('passes a complete snapshot', () => {
		expect(checkSnapshot(build(), translationSource(map()))).toEqual([]);
	});

	it('names a part the translation left out, an extra id and an untranslated description', () => {
		const ko = {
			'sem:api': KO['sem:api'],
			'sem:storage': { label: 'Storage', description: 'Saves orders.' },
			'sem:nope': KO['sem:ui']
		};

		const problems = checkSnapshot(build(ko), translationSource(map()));

		expect(problems).toEqual([
			'ko: sem:storage description has no Korean',
			'ko: sem:ui is missing',
			'ko: sem:nope is not a named part'
		]);
	});

	it('refuses a snapshot over the worker upload cap', () => {
		const snapshot = { ...build(), filePaths: ['x'.repeat(MAX_SNAPSHOT_BYTES)] };

		expect(checkSnapshot(snapshot, translationSource(map()))[0]).toMatch(
			`over ${MAX_SNAPSHOT_BYTES}`
		);
	});

	it('refuses a commit that is not a full SHA', () => {
		const snapshot = { ...build(), commit: 'abc123' };

		expect(checkSnapshot(snapshot, translationSource(map()))).toEqual([
			'commit is not a 40-hex SHA'
		]);
	});
});

describe('file levels', () => {
	// Regression: a `files:` group of several files has no level in the map, so drilling into
	// it in the gallery said "not in snapshot" (gin's 47 root files)
	it('gives a several-file node without a level one node per file, which opens like a file', () => {
		const levels = build().semanticLevels;

		const storage = levels['sem:storage'];
		expect(storage.nodes.map((n) => n.id)).toEqual([
			'file:src/db/client.ts',
			'file:src/db/schema.ts'
		]);
		expect(storage.nodes.every((n) => n.fileCount === 1)).toBe(true);
		expect(storage.breadcrumbLabel).toBe('Storage');
	});

	it('leaves a one-file node and a node that already has a level alone', () => {
		const levels = build().semanticLevels;

		expect(levels['sem:ui']).toBeUndefined();
		expect(levels['sem:api'].nodes.map((n) => n.id)).toEqual([
			'dir:src/api/routes.ts',
			'dir:src/api/auth.ts'
		]);
	});
});

describe('namingGaps', () => {
	it('names the stages the agent left grouped', () => {
		expect(namingGaps(map(), 1)).toEqual([]);
		expect(namingGaps(map(), 2)).toEqual(['stage 2 level sem:api is not named']);
	});
});

describe('snapshotStats', () => {
	it('counts levels, nodes and translated parts', () => {
		expect(snapshotStats(build())).toMatchObject({ levels: 3, nodes: 7, koParts: 3 });
	});
});
