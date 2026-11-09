import { describe, it, expect } from 'vitest';
import { splitFilePath } from './filePath';

describe('splitFilePath', () => {
	it('keeps the file name and the last two folders', () => {
		// Regression: the panel listed 20 rows that all read "transformers/src/transformers/model…"
		const result = splitFilePath('transformers/src/transformers/models/llama/modeling_llama.py');
		expect(result).toEqual({ name: 'modeling_llama.py', dir: '…/models/llama' });
	});

	it('does not add an ellipsis when the path is short', () => {
		expect(splitFilePath('src/main.py')).toEqual({ name: 'main.py', dir: 'src' });
	});

	it('returns an empty folder for a root file', () => {
		expect(splitFilePath('README.md')).toEqual({ name: 'README.md', dir: '' });
	});
});
