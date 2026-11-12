<script lang="ts">
  import ProductCard from '$lib/components/ProductCard.svelte';
  import type { Product } from '$lib/types';

  let { data }: { data: { products: Product[] } } = $props();
</script>

{#each data.products as product (product.id)}
  <ProductCard {product} />
{/each}
