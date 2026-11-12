import type { Product } from './types';

type Fetch = (url: string) => Promise<Response>;

export async function loadProducts(fetchFn: Fetch): Promise<Product[]> {
  const res = await fetchFn('/api/products');
  return parseProducts(await res.json());
}

function parseProducts(raw: unknown): Product[] {
  return Array.isArray(raw) ? (raw as Product[]) : [];
}
