import type { CartLine, Product } from '../types';

class CartStore {
  lines = $state<CartLine[]>([]);

  add(product: Product): void {
    this.lines = [...this.lines, { product, quantity: 1 }];
  }

  clear(): void {
    this.lines = [];
  }
}

export const cart = new CartStore();
