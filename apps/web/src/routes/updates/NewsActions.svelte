<script lang="ts">
  import { isOfficialNewsUrl, type NewsItem } from '@waymark/core';
  import { copyText } from '../../lib/actions';
  import { newsHost } from '../../lib/newsFeed';
  import Button from '../../lib/ui/Button.svelte';

  interface Props {
    item: NewsItem;
    /** Id of the element that holds the item title, so the buttons are described by it. */
    titleId: string;
    /** -1 keeps the buttons of cards that are not showing out of the tab order. */
    tabindex?: 0 | -1;
    /** On narrow screens, show Share as an icon button so both actions fit on one row. */
    dense?: boolean;
  }

  let { item, titleId, tabindex = 0, dense = false }: Props = $props();

  const host = $derived(newsHost(item.url));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function share() {
    if (canShare) {
      try {
        await navigator.share({ title: item.title, url: item.url });
        return;
      } catch (e) {
        // Closing the share sheet is not an error.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await copyText(item.url, 'Copied the link.');
  }
</script>

<div class="actions" class:dense>
  {#if isOfficialNewsUrl(item.url)}
    <Button
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      icon="open_in_new"
      {tabindex}
      aria-describedby={titleId}
    >
      Open on {host}<span class="visually-hidden"> (opens in a new tab)</span>
    </Button>
  {/if}
  <Button
    variant="outlined"
    icon={canShare ? 'share' : 'content_copy'}
    {tabindex}
    class="share"
    title={canShare ? 'Share' : 'Copy link'}
    onclick={share}
    aria-label="{canShare ? 'Share' : 'Copy link'}: {item.title}"
  >
    {canShare ? 'Share' : 'Copy link'}
  </Button>
</div>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  /* The outline follows the text color of the card or row, so it reads on every background. */
  .actions :global(.btn.outlined) {
    color: var(--news-fg, var(--on-surface-variant));
    box-shadow: inset 0 0 0 1.5px currentColor;
  }
  @media (max-width: 479px) {
    .dense :global(.btn.filled) {
      padding: 0 16px;
    }
    .dense :global(.btn.share) {
      width: 40px;
      min-width: 40px;
      padding: 0;
    }
    .dense :global(.btn.share .label) {
      display: none;
    }
  }
</style>
