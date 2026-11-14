import type { EntryGenerator } from './$types';

// The landing is the first screen of ropeman.dev. Rendering it at build time puts it in the
// first HTML response, so it paints before the app's JavaScript arrives and then hydrates.
// It is built once per language, as `/en` and `/ko`. `/` itself is not built: hooks.server.ts
// serves one of the two by the visitor's language.
export const ssr = true;
export const prerender = true;

export const entries: EntryGenerator = () => [{ lang: 'en' }, { lang: 'ko' }];
