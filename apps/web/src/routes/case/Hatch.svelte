<svelte:options namespace="svg" />

<script lang="ts">
  // Diagonal stripes for background updates, so the difference from notices does not rely on color.
  let { id }: { id: string } = $props();
</script>

<pattern {id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect class="hatch-base" width="8" height="8" />
  <rect class="hatch-line" width="3" height="8" />
</pattern>

<style>
  .hatch-base {
    fill: var(--secondary-container);
  }
  .hatch-line {
    fill: var(--secondary);
  }
  @media (forced-colors: active) {
    .hatch-base {
      fill: Canvas;
    }
    .hatch-line {
      fill: CanvasText;
    }
  }
</style>
