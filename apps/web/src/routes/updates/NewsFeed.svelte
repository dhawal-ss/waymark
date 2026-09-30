<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { NEWS_CATEGORY_LABELS } from '@waymark/core';
  import { plural } from '../../lib/format';
  import { loadMoreNews, loadNews, news } from '../../lib/newsData.svelte';
  import {
    caseForms,
    effectiveFilter,
    filterNews,
    matchingForms,
    NEWS_TONES,
    presentCategories,
    type NewsFilter,
  } from '../../lib/newsFeed';
  import { store } from '../../lib/stores/data.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import EmptyState from '../../lib/ui/EmptyState.svelte';
  import FilterChip from '../../lib/ui/FilterChip.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import LoadingIndicator from '../../lib/ui/LoadingIndicator.svelte';
  import { prefersReducedMotion } from '../../lib/ui/keys';
  import NewsCard from './NewsCard.svelte';
  import NewsRow from './NewsRow.svelte';

  interface Props {
    /** Snap-scrolling cards, or a compact list. */
    mode: 'cards' | 'list';
    /** Show the official sources view. */
    onsources: () => void;
  }

  let { mode, onsources }: Props = $props();

  let filter = $state<NewsFilter>('all');
  const userForms = $derived(caseForms(store.data.cases));
  const current = $derived(effectiveFilter(filter, news.items));
  const shown = $derived(filterNews(news.items, current, userForms));
  const categories = $derived(presentCategories(news.items));

  let activeIndex = $state(0);
  // Id of the card in view, so a refresh that adds newer items above it does not move the view.
  let anchorId = '';
  let root: HTMLElement | undefined = $state();
  let stage: HTMLElement | undefined = $state();
  let scroller: HTMLElement | undefined = $state();

  const cards = () =>
    scroller ? [...scroller.querySelectorAll<HTMLElement>(':scope > article')] : [];
  const clamp = (i: number) => Math.max(0, Math.min(shown.length - 1, i));

  function measure() {
    if (!stage) return;
    const top = Math.round(stage.getBoundingClientRect().top + window.scrollY);
    stage.style.setProperty('--feed-top', `${top}px`);
  }

  // Reaching the last card loads older updates once. After a failure the Retry button does it, so
  // scrolling back and forth does not repeat a failing request.
  function loadMoreOnReachingEnd() {
    if (!news.moreError) void loadMoreNews();
  }

  function syncActive() {
    if (!scroller) return;
    const list = cards();
    const stride =
      list.length > 1 ? list[1]!.offsetTop - list[0]!.offsetTop : scroller.clientHeight;
    const i = clamp(Math.round(scroller.scrollTop / Math.max(1, stride)));
    anchorId = shown[i]?.id ?? '';
    if (i === activeIndex) return;
    activeIndex = i;
    if (i === shown.length - 1) loadMoreOnReachingEnd();
  }

  let frame = 0;
  function onscroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncActive();
    });
  }

  function goTo(index: number, focus = true) {
    if (!scroller) return;
    const target = clamp(index);
    const el = cards()[target];
    if (!el) return;
    scroller.scrollTo({ top: el.offsetTop, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    // Focus the card so screen readers announce it. Scrolling is already under way.
    if (focus) el.focus({ preventScroll: true });
  }

  /** Scroll a card's own content first, so text taller than the card can be read by keyboard. */
  function scrollInside(card: HTMLElement, direction: 1 | -1, page: boolean): boolean {
    const body = card.querySelector<HTMLElement>('[data-card-body]');
    if (!body) return false;
    const room =
      direction === 1 ? body.scrollHeight - body.clientHeight - body.scrollTop : body.scrollTop;
    if (room <= 1) return false;
    body.scrollBy({ top: direction * (page ? body.clientHeight * 0.85 : 56), behavior: 'auto' });
    return true;
  }

  const STEP: Record<string, 1 | -1> = {
    ArrowDown: 1,
    PageDown: 1,
    j: 1,
    ArrowUp: -1,
    PageUp: -1,
    k: -1,
  };

  function onkeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || shown.length === 0) return;
    const step = STEP[event.key];
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? shown.length - 1 : undefined;
    if (step === undefined && edge === undefined) return;
    const list = cards();
    const focused = (event.target as Element).closest('article');
    const from = focused ? list.indexOf(focused as HTMLElement) : activeIndex;
    if (
      step !== undefined &&
      focused &&
      scrollInside(focused as HTMLElement, step, event.key.startsWith('Page'))
    ) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    goTo(step !== undefined ? from + step : (edge as number));
  }

  // Keyboard handling is attached to the feed here rather than as a Svelte attribute: the feed is
  // a scrolling region that arrow keys move card by card, not an interactive control.
  $effect(() => {
    const el = scroller;
    if (!el) return;
    el.addEventListener('keydown', onkeydown);
    return () => el.removeEventListener('keydown', onkeydown);
  });

  function setFilter(next: NewsFilter) {
    filter = next;
    activeIndex = 0;
    anchorId = '';
    void tick().then(() => scroller?.scrollTo({ top: 0, behavior: 'auto' }));
  }

  // Keep the same card in view when the list changes above it (a refresh added newer items).
  $effect(() => {
    void shown;
    untrack(() => {
      if (!scroller || !anchorId) return;
      const i = shown.findIndex((x) => x.id === anchorId);
      if (i < 0) return;
      activeIndex = i;
      const el = cards()[i];
      if (el && Math.abs(scroller.scrollTop - el.offsetTop) > 1) scroller.scrollTop = el.offsetTop;
    });
  });

  // Keep the index inside the list when it gets shorter.
  $effect(() => {
    if (activeIndex > shown.length - 1) activeIndex = Math.max(0, shown.length - 1);
  });

  onMount(() => {
    void loadNews();
    measure();
    const observer = new ResizeObserver(measure);
    if (root) observer.observe(root);
    addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => {
      observer.disconnect();
      removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
    };
  });

  const retry = () => void loadNews({ force: true });
  const activeTone = $derived(NEWS_TONES[shown[activeIndex]?.category ?? 'other']);
  const thumbSize = $derived(`max(28px, ${100 / Math.max(1, shown.length)}%)`);
  const progress = $derived(shown.length > 1 ? activeIndex / (shown.length - 1) : 0);
</script>

<div class="feed" bind:this={root}>
  {#if news.items.length > 0}
    <div class="chips" role="group" aria-label="Filter updates">
      <FilterChip
        label="For your cases"
        selected={current === 'mine'}
        onchange={(on) => setFilter(on ? 'mine' : 'all')}
      />
      <FilterChip label="All" selected={current === 'all'} onchange={() => setFilter('all')} />
      {#each categories as c (c)}
        <FilterChip
          label={NEWS_CATEGORY_LABELS[c]}
          selected={current === c}
          onchange={(on) => setFilter(on ? c : 'all')}
        />
      {/each}
    </div>
    <p class="visually-hidden" role="status">{plural(shown.length, 'update')} shown</p>
  {/if}

  {#if news.error && news.items.length > 0}
    <div class="banner" role="alert">
      <p>
        Updates could not be refreshed. {news.error} The list below is from the last successful load.
      </p>
      <Button variant="text" icon="sync" onclick={retry}>Retry</Button>
    </div>
  {/if}

  <div class="stage" class:cards={mode === 'cards'} bind:this={stage}>
    {#if news.loading && news.items.length === 0}
      <div class="center">
        <LoadingIndicator label="Loading official updates" size={64} contained />
        <p class="muted">Loading official updates</p>
      </div>
    {:else if news.error && news.items.length === 0}
      <div class="fill" role="alert">
        <EmptyState icon="error" title="Updates could not be loaded" body={news.error}>
          {#snippet actions()}
            <Button icon="sync" onclick={retry}>Retry</Button>
            <Button variant="outlined" onclick={onsources}>Show official sources</Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else if news.items.length === 0}
      <div class="fill">
        <EmptyState
          icon="newspaper"
          title="No updates yet"
          body="The sync server has not collected any official updates. It checks the Federal Register and USCIS once a day."
        >
          {#snippet actions()}
            <Button icon="sync" onclick={retry}>Check again</Button>
            <Button variant="outlined" onclick={onsources}>Show official sources</Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else if shown.length === 0}
      <div class="fill">
        {#if current === 'mine' && userForms.length === 0}
          <EmptyState
            icon="folder"
            title="No cases to match"
            body="For your cases shows updates that mention the form of one of your cases. Add a case, then come back."
          >
            {#snippet actions()}
              <Button href="#/cases" icon="folder">Go to cases</Button>
              <Button variant="outlined" onclick={() => setFilter('all')}>Show all updates</Button>
            {/snippet}
          </EmptyState>
        {:else}
          <EmptyState
            icon="newspaper"
            title="No matching updates loaded"
            body={current === 'mine'
              ? `None of the ${plural(news.items.length, 'loaded update')} mention ${userForms.join(', ')}.${news.exhausted ? '' : ' Older updates may.'}`
              : `None of the ${plural(news.items.length, 'loaded update')} are in this category.`}
          >
            {#snippet actions()}
              <Button icon="newspaper" onclick={() => setFilter('all')}>Show all updates</Button>
              {#if !news.exhausted}
                <Button
                  variant="outlined"
                  icon="download"
                  onclick={() => void loadMoreNews()}
                  disabled={news.loadingMore}
                >
                  Load older updates
                </Button>
              {/if}
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {:else if mode === 'cards'}
      <div
        class="scroller"
        role="feed"
        aria-label="Official updates"
        aria-busy={news.loadingMore || news.loading}
        bind:this={scroller}
        {onscroll}
      >
        {#each shown as item, i (item.id)}
          <NewsCard
            {item}
            index={i}
            count={shown.length}
            active={i === activeIndex}
            matches={matchingForms(item, userForms)}
          >
            {#snippet footer(tab)}
              {#if i === shown.length - 1}
                {@render listEnd(tab)}
              {/if}
            {/snippet}
          </NewsCard>
        {/each}
      </div>
      <div class="rail {activeTone}" aria-hidden="true">
        <span class="thumb" style="--thumb: {thumbSize}; --progress: {progress}"></span>
      </div>
      {#if shown.length > 1}
        <div class="step {activeTone}">
          <IconButton
            icon="keyboard_arrow_up"
            label="Previous update"
            variant="filled"
            size="m"
            disabled={activeIndex === 0}
            onclick={() => goTo(activeIndex - 1)}
          />
          <IconButton
            icon="keyboard_arrow_down"
            label="Next update"
            variant="filled"
            size="m"
            disabled={activeIndex === shown.length - 1 && news.exhausted}
            onclick={() =>
              activeIndex === shown.length - 1 ? void loadMoreNews() : goTo(activeIndex + 1)}
          />
        </div>
      {/if}
    {:else}
      <ul class="list" role="list" aria-label="Official updates" aria-busy={news.loadingMore}>
        {#each shown as item, i (item.id)}
          <NewsRow {item} index={i} matches={matchingForms(item, userForms)} />
        {/each}
      </ul>
      <div class="list-end">{@render listEnd(0)}</div>
    {/if}
  </div>
</div>

{#snippet listEnd(tab: 0 | -1)}
  <div class="end" aria-live="polite">
    {#if news.loadingMore}
      <LoadingIndicator label="Loading older updates" size={40} />
      <p class="t-label">Loading older updates</p>
    {:else if news.moreError}
      <p class="t-label" role="alert">Older updates could not be loaded. {news.moreError}</p>
      <Button variant="outlined" icon="sync" tabindex={tab} onclick={() => void loadMoreNews()}
        >Retry</Button
      >
    {:else if !news.exhausted}
      <Button variant="outlined" icon="download" tabindex={tab} onclick={() => void loadMoreNews()}>
        Load older updates
      </Button>
    {:else}
      <p class="t-label">
        End of the list. Older updates are on the
        <button type="button" class="link" tabindex={tab} onclick={onsources}
          >official sources</button
        >.
      </p>
    {/if}
  </div>
{/snippet}

<style>
  .feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    gap: 8px;
    margin: 0 calc(var(--gutter) * -1);
    padding: 6px var(--gutter);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips > :global(*) {
    flex: none;
  }
  @media (min-width: 840px) {
    .chips {
      flex-wrap: wrap;
      margin: 0;
      padding: 6px 0;
      overflow: visible;
    }
  }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
  .banner :global(.btn) {
    color: inherit;
  }
  .stage {
    position: relative;
    --feed-bottom: calc(var(--nav-bar-height) + env(safe-area-inset-bottom) + 8px);
  }
  @media (min-width: 840px) {
    .stage {
      --feed-bottom: 24px;
    }
  }
  .stage.cards {
    height: calc(100dvh - var(--feed-top, 240px) - var(--feed-bottom));
    min-height: 420px;
  }
  .scroller {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scroll-snap-type: y mandatory;
    scrollbar-width: none;
  }
  .scroller::-webkit-scrollbar {
    display: none;
  }
  .center,
  .fill {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
  }
  .center {
    min-height: 240px;
  }
  .fill {
    align-items: stretch;
    justify-content: flex-start;
    overflow-y: auto;
  }
  .rail {
    position: absolute;
    top: 28px;
    right: 8px;
    bottom: 28px;
    width: 4px;
    border-radius: var(--shape-full);
    background: color-mix(in srgb, var(--tone-on-container) 22%, transparent);
    pointer-events: none;
    transition: background-color var(--duration-medium) var(--ease-standard);
  }
  .thumb {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--progress) * (100% - var(--thumb)));
    height: var(--thumb);
    border-radius: var(--shape-full);
    background: var(--tone-on-container);
    transition:
      top var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-medium) var(--ease-standard);
  }
  .step {
    display: none;
  }
  @media (min-width: 840px) {
    .rail {
      right: 16px;
    }
    .step {
      position: absolute;
      top: 50%;
      right: 28px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      translate: 0 -50%;
    }
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .list-end {
    padding: 16px 0 8px;
  }
  .end {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    min-height: 40px;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  @media (forced-colors: active) {
    .rail,
    .thumb {
      background: CanvasText;
    }
  }
</style>
