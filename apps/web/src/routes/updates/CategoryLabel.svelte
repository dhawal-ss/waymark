<script lang="ts">
  import { NEWS_CATEGORY_LABELS, type NewsCategory } from '@waymark/core';
  import FeedIcon from './FeedIcon.svelte';
  import type { FeedIconName } from './feedIcons';

  const ICONS: Record<NewsCategory, FeedIconName> = {
    fees: 'payments',
    forms: 'description',
    policy: 'gavel',
    processing: 'schedule',
    visa: 'public',
    citizenship: 'flag',
    humanitarian: 'volunteer_activism',
    work: 'work',
    safety: 'shield',
    other: 'article',
  };

  let { category, size = 18 }: { category: NewsCategory; size?: number } = $props();
</script>

<span class="category">
  <FeedIcon name={ICONS[category]} {size} />
  <span>{NEWS_CATEGORY_LABELS[category]}</span>
</span>

<style>
  .category {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px 0 10px;
    border-radius: var(--shape-full);
    background: color-mix(in srgb, var(--news-fg) 14%, transparent);
    color: var(--news-fg);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  @media (forced-colors: active) {
    .category {
      border: 1px solid CanvasText;
    }
  }
</style>
