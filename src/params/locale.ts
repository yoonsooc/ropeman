import type { ParamMatcher } from '@sveltejs/kit';
import { parseLocale } from '$lib/utils/locale';

export const match: ParamMatcher = (param) => parseLocale(param) !== null;
