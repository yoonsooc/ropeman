<script lang="ts">
  import { cart } from '../stores/cart.svelte';
  import { total } from '../utils/cart';
  import { formatPrice } from '$lib';

  const sum = $derived(formatPrice(total(cart.lines)));

  function reset(): void {
    cart.clear();
  }
</script>

<p>{sum}</p>
<button onclick={reset}>Clear</button>
