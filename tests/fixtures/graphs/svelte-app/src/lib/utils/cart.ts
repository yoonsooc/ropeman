import type { CartLine } from '$lib/types';

export function lineTotal(line: CartLine): number {
  return line.product.cents * line.quantity;
}

export function total(lines: CartLine[]): number {
  let sum = 0;
  for (const line of lines) sum += lineTotal(line);
  return sum;
}
