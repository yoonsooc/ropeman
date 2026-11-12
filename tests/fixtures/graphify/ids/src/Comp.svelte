<script lang="ts">
  let { n } = $props();
  function bump(): void {
    n += 1;
  }
  const twice = () => n * 2;
</script>

<button onclick={bump}>{twice()}</button>
