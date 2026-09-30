<script lang="ts">
  import { CATEGORY_LABELS, type EventCategory, type Milestone } from '@waymark/core';
  import { formatDate } from '../format';

  interface Props {
    milestones: Milestone[];
    /** Position of today on the track, 0 to 1. */
    todayPosition: number;
    /** Position of the processing time end, when known. */
    expectedPosition?: number;
  }

  let { milestones, todayPosition, expectedPosition }: Props = $props();

  const categories = $derived([...new Set(milestones.map((m) => m.category))]);
  const description = $derived(
    milestones.map((m) => `${m.label} on ${formatDate(m.date)}, day ${m.day}`).join('. '),
  );
  const pct = (p: number) => `${(p * 100).toFixed(2)}%`;
</script>

<div class="track-wrap">
  <div class="track" role="img" aria-label="Milestones since filing. {description}">
    <span class="line"></span>
    <span class="elapsed" style="width: {pct(todayPosition)}"></span>
    {#if expectedPosition !== undefined}
      <span class="expected" style="left: {pct(expectedPosition)}" title="End of processing time"
      ></span>
    {/if}
    {#each milestones as m (m.key)}
      <span
        class="dot cat-{m.category}"
        style="left: {pct(m.position)}"
        title="{m.label}, {formatDate(m.date)}, day {m.day}"
      ></span>
    {/each}
  </div>
  <div class="ends t-small muted">
    <span>Filed</span>
    <span
      >{expectedPosition !== undefined && expectedPosition > todayPosition
        ? 'End of processing time'
        : 'Today'}</span
    >
  </div>
  {#if categories.length > 0}
    <ul class="legend t-small" role="list" aria-hidden="true">
      {#each categories as c (c)}
        <li><span class="dot static cat-{c as EventCategory}"></span>{CATEGORY_LABELS[c]}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .track-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .track {
    position: relative;
    height: 28px;
    margin: 0 8px;
  }
  .line,
  .elapsed {
    position: absolute;
    top: 50%;
    left: 0;
    height: 4px;
    border-radius: 2px;
    translate: 0 -50%;
  }
  .line {
    right: 0;
    background: var(--surface-container-highest);
  }
  .elapsed {
    background: var(--outline-variant);
  }
  .expected {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 2px;
    background: var(--on-surface-variant);
    translate: -1px 0;
  }
  .dot {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--surface);
    translate: -50% -50%;
    background: var(--cat);
  }
  .dot.static {
    position: static;
    display: inline-block;
    translate: none;
    margin-right: 6px;
    vertical-align: -2px;
    border: 0;
    width: 10px;
    height: 10px;
  }
  .ends {
    display: flex;
    justify-content: space-between;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
    padding: 0;
    color: var(--on-surface-variant);
  }
  .cat-receipt,
  .cat-processing {
    --cat: var(--primary);
  }
  .cat-checks,
  .cat-hold {
    --cat: var(--secondary);
  }
  .cat-interview,
  .cat-evidence {
    --cat: var(--tertiary);
  }
  .cat-approved,
  .cat-card {
    --cat: var(--success);
  }
  .cat-denied {
    --cat: var(--error);
  }
  .cat-closed,
  .cat-unknown {
    --cat: var(--outline);
  }
</style>
