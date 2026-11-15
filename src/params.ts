import { defineParams } from '@sveltejs/kit/params';
import { parseLocale } from '#lib/utils/locale.ts';

export const params = defineParams({
	locale: (param) => (parseLocale(param) !== null ? param : undefined)
});
