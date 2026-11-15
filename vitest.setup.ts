/* eslint-disable no-console -- this file wraps console.warn */
import { afterEach } from 'vitest';

// refQueries keeps a file whose ref query failed and only warns, so the product degrades to
// "no relations". In a test that warning is a failure, unless the test stubs console.warn.
const refWarnings: string[] = [];
const warn = console.warn;
console.warn = (...args: unknown[]) => {
	if (String(args[0]).startsWith('[refQueries]')) refWarnings.push(args.map(String).join(' '));
	warn(...args);
};

afterEach(() => {
	const seen = refWarnings.splice(0);
	if (seen.length) throw new Error(`a ref query failed:\n${seen.join('\n')}`);
});
