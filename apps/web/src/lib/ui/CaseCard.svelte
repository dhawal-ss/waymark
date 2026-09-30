<script lang="ts">
  import {
    currentStatus,
    daysSinceFiling,
    lastUscisEvent,
    newEventCount,
    STATUSES,
    waitPosition,
    type Case,
    type LocalDate,
  } from '@waymark/core';
  import { plural, relativeTime } from '../format';
  import { casePath } from '../stores/router.svelte';
  import FormBadge from './FormBadge.svelte';
  import Pill from './Pill.svelte';
  import Receipt from './Receipt.svelte';
  import StatusPill from './StatusPill.svelte';
  import WavyProgress from './WavyProgress.svelte';

  interface Props {
    c: Case;
    today: LocalDate;
    timeZone?: string;
  }

  let { c, today, timeZone }: Props = $props();

  const status = $derived(currentStatus(c, timeZone));
  const tone = $derived(STATUSES[status].tone);
  const days = $derived(daysSinceFiling(c, today));
  const wait = $derived(waitPosition(c, today));
  const fresh = $derived(newEventCount(c));
  const last = $derived(lastUscisEvent(c));
</script>

<a class="card tone-{tone}" href={casePath(c.id)}>
  <div class="top">
    <FormBadge form={c.form} />
    <div class="who">
      <span class="t-title name">{c.owner || c.form}</span>
      <Receipt receipt={c.receipt} />
    </div>
    <span class="days" aria-label="{plural(days, 'day')} since filing">
      <span class="num">{days}</span>
      <span class="t-small">days</span>
    </span>
  </div>
  {#if wait}
    <WavyProgress
      value={wait.elapsed}
      max={wait.total}
      label="Time since filing against processing time"
      valueText="{wait.elapsed} of {wait.total} days"
    />
  {/if}
  <div class="pills">
    <StatusPill {status} />
    {#if fresh > 0}<Pill label="{fresh} new" tone="new" />{/if}
    {#if c.demo}<Pill label="Demo" icon="info" />{/if}
  </div>
  {#if last}
    <p class="t-small muted last">
      {last.info.label} <span class="t-mono">{last.code}</span>, {relativeTime(last.at)}
    </p>
  {/if}
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 16px 14px;
    border-radius: var(--shape-xl) var(--shape-s) var(--shape-xl) var(--shape-s);
    background: var(--surface-container-low);
    color: var(--on-surface);
    text-decoration: none;
    border-left: 4px solid var(--tone-accent);
    transition:
      background-color var(--duration-short) var(--ease-standard),
      border-radius var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  .card:hover {
    background: var(--surface-container);
  }
  .card:active {
    border-radius: var(--shape-l);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .days {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1;
  }
  .num {
    font-size: 1.75rem;
    font-weight: 720;
    font-stretch: 70%;
    font-variant-numeric: tabular-nums;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .last .t-mono {
    font-size: 0.75rem;
  }
  @media (forced-colors: active) {
    .card {
      border: 1px solid CanvasText;
    }
  }
</style>
