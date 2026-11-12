<script lang="ts">
  import { Button } from '$lib';
  import { cart } from '$lib/stores/cart.svelte';
  import { lineTotal } from '$lib/utils/cart';
  import { formatPrice } from '$lib/utils/price';

  function priceOf(index: number): string {
    return formatPrice(lineTotal(cart.lines[index]));
  }
</script>

{#each cart.lines as line, i (line.product.id)}
  <p>{line.product.name} {priceOf(i)}</p>
{/each}
<Button label="Clear" onclick={() => cart.clear()} />
