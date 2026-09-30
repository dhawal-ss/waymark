<script lang="ts">
  import { FEED_ICONS, type FeedIconName } from './feedIcons';

  let { name, size = 24 }: { name: FeedIconName; size?: number } = $props();
</script>

<svg
  viewBox="0 -960 960 960"
  width={size}
  height={size}
  fill="currentColor"
  focusable="false"
  aria-hidden="true"
>
  <path d={FEED_ICONS[name]} />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
