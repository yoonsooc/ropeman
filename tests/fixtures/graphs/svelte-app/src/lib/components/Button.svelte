<script lang="ts">
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button {onclick}>{label}</button>
