export interface Product {
  id: string;
  name: string;
  cents: number;
}

export interface CartLine {
  product: Product;
  quantity: number;
}
