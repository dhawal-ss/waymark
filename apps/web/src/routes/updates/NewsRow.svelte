<script lang="ts">
  import type { NewsItem } from '@waymark/core';
  import { formatDate } from '../../lib/format';
  import { NEWS_TONES } from '../../lib/newsFeed';
  import CategoryLabel from './CategoryLabel.svelte';
  import NewsActions from './NewsActions.svelte';
  import NewsTags from './NewsTags.svelte';

  interface Props {
    item: NewsItem;
    /** Zero-based position in the shown list, used for unique element ids. */
    index: number;
    /** Forms in the item that match the user's cases. */
    matches: string[];
  }

  let { item, index, matches }: Props = $props();

  const titleId = $derived(`news-row-title-${index}`);
</script>

<li class="row {NEWS_TONES[item.category]}">
  <div class="head">
    <CategoryLabel category={item.category} size={16} />
    <p class="meta t-small">
      {#if item.kind}<span class="kind">{item.kind}</span>{/if}
      <time datetime={item.publishedOn}>{formatDate(item.publishedOn)}</time>
    </p>
  </div>
  <h2 id={titleId} class="t-title">{item.title}</h2>
  {#if item.summary}<p class="summary t-small">{item.summary}</p>{/if}
  <NewsTags {item} {matches} />
  <NewsActions {item} {titleId} />
</li>

<style>
  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 16px;
    border-left: 4px solid var(--tone-accent);
    border-radius: var(--shape-xl) var(--shape-s) var(--shape-xl) var(--shape-s);
    --news-fg: var(--on-surface);
    --news-bg: var(--surface-container-low);
    background: var(--news-bg);
    color: var(--news-fg);
  }
  /* The label is a tone container with its own text color, whatever the theme. */
  .row :global(.category) {
    background: var(--tone-container);
    color: var(--tone-on-container);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    color: var(--on-surface-variant);
  }
  .kind {
    font-weight: 700;
  }
  h2 {
    overflow-wrap: anywhere;
  }
  .summary {
    max-width: 64ch;
    color: var(--on-surface-variant);
  }
  @media (forced-colors: active) {
    .row {
      border: 1px solid CanvasText;
    }
  }
</style>
