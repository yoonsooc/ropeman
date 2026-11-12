<script lang="ts">
  import Button from './Button.svelte';
  import { formatPrice } from '$lib/utils/price';
  import { cart } from '$lib/stores/cart.svelte';
  import type { Product } from '$lib/types';

  let { product }: { product: Product } = $props();

  const price = formatPrice(product.cents);

  function addToCart(): void {
    cart.add(product);
  }
</script>

<article>
  <h2>{product.name}</h2>
  <p>{price}</p>
  <Button label="Add" onclick={addToCart} />
</article>
