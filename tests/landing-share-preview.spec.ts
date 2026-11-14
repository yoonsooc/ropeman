import { test, expect, type APIRequestContext } from '@playwright/test';

// Link previews (LinkedIn, KakaoTalk, X) come from crawlers that read the raw HTML and run no
// JavaScript, so these checks read the response body, not the rendered page.

async function headTags(request: APIRequestContext, path: string, acceptLanguage?: string) {
	const response = await request.get(path, {
		headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {}
	});
	expect(response.status()).toBe(200);
	const html = await response.text();
	const head = html.slice(0, html.indexOf('</head>'));
	const meta = (key: string) =>
		head.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];
	const links = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
	return {
		lang: html.match(/<html lang="([^"]+)"/)?.[1],
		titles: [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]),
		canonical: head.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
		hreflang: Object.fromEntries(links.map((m) => [m[1], m[2]])),
		meta
	};
}

const PREVIEWS = [
	{
		name: 'English, as crawlers get `/`',
		path: '/',
		acceptLanguage: undefined,
		lang: 'en',
		title: 'Map a repo from your coding agent | Ropeman',
		url: 'https://ropeman.dev/',
		ogLocale: 'en_US',
		image: 'https://ropeman.dev/og/landing-en.png'
	},
	{
		name: 'Korean at `/ko`',
		path: '/ko',
		acceptLanguage: undefined,
		lang: 'ko',
		title: '코딩 에이전트로 저장소 지도를 그리세요 | Ropeman',
		url: 'https://ropeman.dev/ko',
		ogLocale: 'ko_KR',
		image: 'https://ropeman.dev/og/landing-ko.png'
	},
	{
		name: 'Korean at `/` for a Korean browser',
		path: '/',
		acceptLanguage: 'ko-KR,ko;q=0.9',
		lang: 'ko',
		title: '코딩 에이전트로 저장소 지도를 그리세요 | Ropeman',
		url: 'https://ropeman.dev/ko',
		ogLocale: 'ko_KR',
		image: 'https://ropeman.dev/og/landing-ko.png'
	}
];

for (const preview of PREVIEWS) {
	test(`share preview tags are in the raw HTML: ${preview.name}`, async ({ request }) => {
		const tags = await headTags(request, preview.path, preview.acceptLanguage);

		expect(tags.lang).toBe(preview.lang);
		expect(tags.titles).toEqual([preview.title]);
		expect(tags.canonical).toBe(preview.url);
		expect(tags.hreflang).toEqual({
			en: 'https://ropeman.dev/',
			ko: 'https://ropeman.dev/ko',
			'x-default': 'https://ropeman.dev/'
		});
		expect(tags.meta('og:title')).toBe(preview.title);
		expect(tags.meta('twitter:title')).toBe(preview.title);
		expect(tags.meta('og:url')).toBe(preview.url);
		expect(tags.meta('og:type')).toBe('website');
		expect(tags.meta('og:locale')).toBe(preview.ogLocale);
		expect(tags.meta('og:image')).toBe(preview.image);
		expect(tags.meta('twitter:image')).toBe(preview.image);
		expect(tags.meta('twitter:card')).toBe('summary_large_image');
		for (const key of ['description', 'og:description', 'og:image:alt', 'twitter:description']) {
			expect(tags.meta(key)?.length, key).toBeGreaterThan(20);
		}
	});
}

for (const locale of ['en', 'ko']) {
	test(`the ${locale} share image is a 1200x630 PNG`, async ({ request }) => {
		const response = await request.get(`/og/landing-${locale}.png`);
		const png = await response.body();

		expect(response.status()).toBe(200);
		expect(png.subarray(1, 4).toString()).toBe('PNG');
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
	});
}

test('the sitemap lists both landing addresses', async ({ request }) => {
	const xml = await (await request.get('/sitemap.xml')).text();

	expect(xml).toContain('<loc>https://ropeman.dev/</loc>');
	expect(xml).toContain('<loc>https://ropeman.dev/ko</loc>');
});
