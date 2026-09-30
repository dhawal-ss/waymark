<script lang="ts">
  import { CATEGORY_LABELS, explainEvent, STAGE_LABELS, type TimelineItem } from '@waymark/core';
  import { formatDateTime } from '../../lib/format';
  import Icon from '../../lib/ui/Icon.svelte';
  import Pill from '../../lib/ui/Pill.svelte';
  import SignalTag from './SignalTag.svelte';

  type UscisItem = Extract<TimelineItem, { kind: 'uscis' }>;

  let { item, zone }: { item: UscisItem; zone: string | undefined } = $props();

  const uid = $props.id();
  const x = $derived(explainEvent(item.info));
  const recognized = $derived(item.info.category !== 'unknown');

  let open = $state(false);
  // The explanation is built on the first open and kept, so a closed row adds nothing to the page.
  let built = $state(false);

  function toggle() {
    open = !open;
    if (open) built = true;
  }

  const ROWS = [
    ['What it is', 'what'],
    ['Why it happens', 'why'],
    ['Its purpose', 'purpose'],
    ['What comes next', 'next'],
  ] as const;
</script>

<div class="t-main">
  <button
    type="button"
    id="{uid}-button"
    class="disclose"
    aria-expanded={open}
    aria-controls="{uid}-region"
    onclick={toggle}
  >
    <span class="t-body">{item.info.label}</span>
    <span class="chevron" class:open aria-hidden="true"
      ><Icon name="keyboard_arrow_down" size={20} /></span
    >
  </button>
  {#if item.isNew}<Pill label="New" tone="new" />{/if}
</div>
<div class="meta">
  <SignalTag signal={x.signal} />
  <span class="t-small muted">
    {formatDateTime(item.at, zone)}. Day {item.day}.
    <!-- Official API statuses get made-up "CS:" codes; only real USCIS codes show. -->
    {#if !x.official}<span class="t-mono">{item.code}</span>,{/if}
    {CATEGORY_LABELS[item.info.category].toLowerCase()}.
  </span>
</div>
<div class="reveal" class:open id="{uid}-region" role="group" aria-labelledby="{uid}-button">
  <div class="reveal-inner">
    {#if built}
      <div class="explain tone-{x.tone}">
        <dl>
          {#each ROWS as [heading, field] (field)}
            <div>
              <dt class="t-label">{heading}</dt>
              <dd class="t-body">{x[field]}</dd>
            </div>
          {/each}
        </dl>
        <p class="source t-small">
          <Icon name="info" size={16} />
          <span>
            {#if x.official}
              From the official USCIS Case Status API.
            {:else if recognized}
              Community documented, not from USCIS. Code <span class="t-mono">{item.code}</span>.
            {:else}
              Not in the community dictionary, and not from USCIS. Code
              <span class="t-mono">{item.code}</span>.
            {/if}
            {#if recognized}Journey stage: {STAGE_LABELS[x.stage]}.{/if}
          </span>
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .t-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
  }
  .disclose {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 40px;
    margin: -4px 0 -4px -8px;
    padding: 4px 8px;
    border: 0;
    border-radius: var(--shape-s);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    .disclose:hover {
      background: color-mix(
        in srgb,
        var(--on-surface) calc(var(--state-hover) * 100%),
        transparent
      );
    }
  }
  .chevron {
    display: inline-flex;
    color: var(--on-surface-variant);
    transition: rotate var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  .chevron.open {
    rotate: 180deg;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
  .reveal {
    display: grid;
    grid-template-rows: 0fr;
    visibility: hidden;
    transition:
      grid-template-rows var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      visibility 0s linear var(--spring-fast-spatial-duration);
  }
  .reveal.open {
    grid-template-rows: 1fr;
    visibility: visible;
    transition:
      grid-template-rows var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      visibility 0s;
  }
  .reveal-inner {
    min-height: 0;
    overflow: hidden;
  }
  .explain {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--surface-container);
    border-left: 4px solid var(--tone-accent);
  }
  dl {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }
  dt {
    color: var(--on-surface-variant);
  }
  dd {
    margin: 0;
  }
  .source {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--on-surface-variant);
  }
  .source :global(svg) {
    margin-top: 1px;
  }
</style>
