import { describe, it, expect } from 'vitest';
import {
	MAX_FAR_TITLE_CHARS,
	MAX_TITLE_PX,
	middleEllipsis,
	titleBreaks,
	titleFitPx
} from './cardTitle';

describe('titleBreaks', () => {
	it('breaks file and folder names after _ - / and before a dot', () => {
		expect(titleBreaks('scip_ingest.py')).toEqual(['scip_', 'ingest', '.py']);
		expect(titleBreaks('react-dom/src')).toEqual(['react-', 'dom/', 'src']);
	});

	// Regression: an AI-named title such as "Pluggable JSON codecs" counted as one long word and
	// shrank to the smallest size, though it wraps at its spaces
	it('breaks a title of words at its spaces', () => {
		expect(titleBreaks('Pluggable JSON codecs')).toEqual(['Pluggable ', 'JSON ', 'codecs']);
		expect(titleFitPx('Pluggable JSON codecs')).toBeGreaterThan(titleFitPx('PluggableJSONcodecs'));
	});

	it('keeps the pieces of a title in order, so they join back to it', () => {
		const title = 'check_providers.yaml-files/__init__.py';
		expect(titleBreaks(title).join('')).toBe(title);
	});
});

describe('middleEllipsis', () => {
	it('leaves a title that fits as it is', () => {
		expect(middleEllipsis('levelLayout.test.ts')).toBe('levelLayout.test.ts');
	});

	// Regression: a clamp at the end cut `levelLayout.test.ts` and `levelLayout.ts` to the same text
	it('keeps the end of a long name, where sibling files differ', () => {
		// Arrange
		const a = 'check_providers_yaml_files_are_consistent.py';
		const b = 'check_providers_yaml_files_are_sorted.py';
		// Act
		const [shortA, shortB] = [middleEllipsis(a), middleEllipsis(b)];
		// Assert
		expect(shortA.length).toBe(MAX_FAR_TITLE_CHARS);
		expect(shortA).toContain('…');
		expect(shortA.endsWith('_consistent.py')).toBe(true);
		expect(shortB.endsWith('_are_sorted.py')).toBe(true);
		expect(shortA.startsWith('check_')).toBe(true);
	});
});

describe('titleFitPx', () => {
	it('gives a short title the largest size', () => {
		expect(titleFitPx('cli.py')).toBe(MAX_TITLE_PX);
	});

	it('shrinks a longer title so it still fits its two lines', () => {
		// Arrange
		const short = titleFitPx('levelLayout.ts');
		const long = titleFitPx('levelLayout.test.ts');
		const longest = titleFitPx(middleEllipsis('check_providers_yaml_files_are_consistent.py'));
		// Assert
		expect(long).toBeLessThanOrEqual(short);
		expect(longest).toBeLessThan(long);
		expect(longest).toBeGreaterThanOrEqual(12);
	});
});
