<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { NewsItem } from '@waymark/core';
  import { formatDate, formatMonth } from '../../lib/format';
  import { NEWS_CLIPS, NEWS_SHAPES, NEWS_TONES, titleTier } from '../../lib/newsFeed';
  import { radii, radiiToPath } from '../../lib/ui/shapes';
  import CategoryLabel from './CategoryLabel.svelte';
  import NewsActions from './NewsActions.svelte';
  import NewsTags from './NewsTags.svelte';

  interface Props {
    item: NewsItem;
    /** Zero-based position in the shown list. */
    index: number;
    /** Number of items in the shown list. */
    count: number;
    /** The card in view: it is the one in the tab order. */
    active: boolean;
    /** Forms in the item that match the user's cases. */
    matches: string[];
    /** Status shown above the actions on the last card (loading older updates, end of list). */
    footer?: Snippet<[0 | -1]>;
  }

  let { item, index, count, active, matches, footer }: Props = $props();

  const titleId = $derived(`news-title-${index}`);
  const tone = $derived(NEWS_TONES[item.category]);
  const shape = $derived(radii(NEWS_SHAPES[item.category]));
  const mark = $derived(radiiToPath(shape, 50, 50, 50, 0.35));
  const day = $derived(Number(item.publishedOn.slice(8, 10)));
  const month = $derived(formatMonth(item.publishedOn.slice(0, 7)).split(' ')[0]);
</script>

<!-- ARIA feed pattern: the card in view takes focus so keys and screen readers can land on it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
  class="card {tone}"
  class:active
  class:odd={index % 2 === 1}
  aria-labelledby={titleId}
  aria-posinset={index + 1}
  aria-setsize={count}
  tabindex={active ? 0 : -1}
>
  <svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d={mark} /></svg>
  <div class="body" data-card-body>
    <div class="top">
      <div class="lead">
        <CategoryLabel category={item.category} />
        <p class="meta t-label">
          {#if item.kind}<span class="kind">{item.kind}</span>{/if}
          <time datetime={item.publishedOn}>{formatDate(item.publishedOn)}</time>
        </p>
        <p class="pos t-small" aria-hidden="true">{index + 1} of {count}</p>
      </div>
      <div class="badge" aria-hidden="true" style:clip-path={NEWS_CLIPS[item.category]}>
        <span class="day">{day}</span>
        <span class="month">{month}</span>
      </div>
    </div>
    <div class="text">
      <h2 id={titleId} class="title t-headline {titleTier(item.title)}">{item.title}</h2>
      {#if item.summary}<p class="summary t-body">{item.summary}</p>{/if}
    </div>
    <NewsTags {item} {matches} />
    {#if footer}{@render footer(active ? 0 : -1)}{/if}
    <div class="dock">
      <NewsActions {item} {titleId} tabindex={active ? 0 : -1} dense />
    </div>
  </div>
</article>

<style>
  .card {
    position: relative;
    flex: none;
    height: 100%;
    overflow: hidden;
    border-radius: var(--shape-xl);
    --news-fg: var(--tone-on-container);
    --news-bg: var(--tone-container);
    background: var(--news-bg);
    color: var(--news-fg);
    scroll-snap-align: start;
    scroll-snap-stop: always;
    transition: border-radius var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  .card.active {
    border-radius: var(--shape-2xl) var(--shape-s) var(--shape-2xl) var(--shape-s);
  }
  .card.active.odd {
    border-radius: var(--shape-s) var(--shape-2xl) var(--shape-s) var(--shape-2xl);
  }
  /* The ring is drawn above the content so the sticky action bar does not hide part of it. */
  .card:focus-visible {
    outline: none;
  }
  .card:focus-visible::after {
    content: '';
    position: absolute;
    inset: 4px;
    z-index: 2;
    border: 3px solid var(--news-fg);
    border-radius: inherit;
    pointer-events: none;
  }
  .mark {
    position: absolute;
    top: -70px;
    right: -70px;
    width: 260px;
    height: 260px;
    fill: color-mix(in srgb, var(--tone-accent) 16%, transparent);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .mark {
      rotate: -14deg;
      scale: 0.9;
      transition:
        rotate var(--spring-slow-spatial-duration) var(--spring-slow-spatial),
        scale var(--spring-slow-spatial-duration) var(--spring-slow-spatial);
    }
    .active .mark {
      rotate: 0deg;
      scale: 1;
    }
  }
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    padding: 16px 24px 0 16px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .body > :global(*) {
    flex: none;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .lead {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    padding-left: 2px;
  }
  .kind {
    font-weight: 720;
  }
  .pos {
    padding-left: 2px;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    position: relative;
    display: grid;
    place-items: center;
    align-content: center;
    width: 88px;
    height: 88px;
    margin-top: -2px;
    background: var(--tone-accent);
    color: var(--tone-on-accent);
    line-height: 1;
  }
  .day {
    font-size: 2.5rem;
    font-weight: 760;
    font-stretch: 62%;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .month {
    margin-top: 2px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: auto;
    max-width: 44rem;
  }
  .title {
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .title.short {
    font-size: 1.75rem;
    line-height: 2.125rem;
    font-weight: 620;
  }
  .title.long {
    font-size: 1.25rem;
    line-height: 1.75rem;
  }
  .title.longest {
    font-size: 1.0625rem;
    line-height: 1.5rem;
    font-stretch: 100%;
  }
  .summary {
    max-width: 60ch;
  }
  .dock {
    position: sticky;
    bottom: 0;
    padding: 12px 0 16px;
    background: linear-gradient(to bottom, transparent, var(--news-bg) 12px);
  }
  @media (max-height: 700px) {
    .badge {
      width: 72px;
      height: 72px;
    }
    .day {
      font-size: 2rem;
    }
  }
  @media (min-width: 840px) {
    .card.active,
    .card.active.odd {
      border-radius: var(--shape-2xl);
    }
    .card.active {
      border-radius: 64px var(--shape-m) 64px var(--shape-m);
    }
    .card.active.odd {
      border-radius: var(--shape-m) 64px var(--shape-m) 64px;
    }
    .mark {
      top: -140px;
      right: -110px;
      width: 460px;
      height: 460px;
    }
    .body {
      gap: 16px;
      padding: 32px 56px 0 40px;
    }
    .badge {
      width: 152px;
      height: 152px;
    }
    .day {
      font-size: 4.5rem;
    }
    .month {
      font-size: 1rem;
    }
    .title.short {
      font-size: 2.5rem;
      line-height: 3rem;
    }
    .title.medium {
      font-size: 2rem;
      line-height: 2.5rem;
    }
    .title.long {
      font-size: 1.625rem;
      line-height: 2.125rem;
    }
    .title.longest {
      font-size: 1.375rem;
      line-height: 1.875rem;
    }
    .summary {
      font-size: 1.125rem;
      line-height: 1.75rem;
    }
    .dock {
      padding-bottom: 32px;
    }
  }
  @media (forced-colors: active) {
    .card {
      border: 2px solid CanvasText;
    }
    .mark {
      fill: Canvas;
      stroke: CanvasText;
    }
    .badge {
      background: Canvas;
      color: CanvasText;
    }
  }
</style>
