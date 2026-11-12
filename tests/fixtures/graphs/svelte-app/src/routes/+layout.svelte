<script lang="ts">
  import type { Snippet } from 'svelte';
  import CartSummary from '$lib/components/CartSummary.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<CartSummary />
{@render children()}
