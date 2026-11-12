import { loadProducts } from '$lib/api';
import type { Product } from '$lib/types';

export async function load({ fetch }: { fetch: typeof globalThis.fetch }): Promise<{ products: Product[] }> {
  return { products: await loadProducts(fetch) };
}
