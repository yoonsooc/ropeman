// The landing is the first screen of ropeman.dev. Rendering it at build time puts it in the
// first HTML response, so it paints before the app's JavaScript arrives and then hydrates.
export const ssr = true;
