<script lang="ts">
  import { ICONS, type IconName } from './icons';

  let { name, size = 24, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
  viewBox="0 -960 960 960"
  width={size}
  height={size}
  fill="currentColor"
  focusable="false"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <path d={ICONS[name]} />
</svg>

<style>
  svg {
    flex: none;
  }
</style>
