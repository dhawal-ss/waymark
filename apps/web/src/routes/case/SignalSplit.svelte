<script lang="ts">
  import {
    SIGNAL_DESCRIPTIONS,
    type ActivityBreakdown,
    type EventSignal,
    type SilentSinceNotice,
    type Tone,
  } from '@waymark/core';
  import { segmentWidths } from '../../lib/chart';
  import { formatDate, plural } from '../../lib/format';
  import Icon from '../../lib/ui/Icon.svelte';
  import Hatch from './Hatch.svelte';
  import SignalSwatch from './SignalSwatch.svelte';

  interface Props {
    breakdown: ActivityBreakdown;
    since: SilentSinceNotice;
    /** Tone of the current status. The reassurance only applies while the case is in review. */
    tone: Tone;
  }

  let { breakdown, since, tone }: Props = $props();

  const GAP = 2;
  const HEIGHT = 20;
  const uid = $props.id();

  let width = $state(0);

  const notice = $derived(breakdown.bySignal.notice);
  const silent = $derived(breakdown.bySignal.silent);
  const total = $derived(breakdown.total);

  const sentence = $derived.by(() => {
    if (total === 1) {
      return notice === 1
        ? 'The only event is a notice.'
        : 'The only event is a background update.';
    }
    const n = notice === 1 ? 'is a notice' : 'are notices';
    const s = silent === 1 ? 'is a background update' : 'are background updates';
    return `${notice} of ${total} events ${n} and ${silent} ${s}.`;
  });

  const parts = $derived(
    (['notice', 'silent'] as const)
      .map((signal) => ({ signal, count: breakdown.bySignal[signal] }))
      .filter((p) => p.count > 0),
  );
  const segments = $derived.by(() => {
    const avail = Math.max(0, width - GAP * (parts.length - 1));
    const widths = segmentWidths(
      parts.map((p) => p.count),
      avail,
    );
    let x = 0;
    return parts.map((p, i) => {
      const w = widths[i] ?? 0;
      const seg = { ...p, x, w };
      x += w + GAP;
      return seg;
    });
  });

  const rows: { signal: EventSignal; name: string }[] = [
    { signal: 'notice', name: 'Notices' },
    { signal: 'silent', name: 'Background updates' },
  ];

  // Shown only when background updates came after the last notice. It states what happened and
  // never says what the outcome will be.
  const callout = $derived.by(() => {
    if (since.count === 0) return null;
    const updates = plural(since.count, 'background update');
    const head = since.lastNoticeDate
      ? `${updates} since your last notice on ${formatDate(since.lastNoticeDate)}.`
      : `${updates} and no notices in the case data.`;
    const tail =
      tone === 'progress'
        ? ' Background updates are usually routine while a case is in review.'
        : tone === 'action'
          ? ' Check your latest notice for anything USCIS asked you to do.'
          : '';
    return head + tail;
  });

  const apiOnly = $derived(total > 0 && breakdown.official === total);
</script>

<div class="split">
  <h3 class="t-label">Notices and background updates</h3>
  <p class="t-body">{sentence}</p>
  <div class="plot" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} height={HEIGHT} viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
        <defs>
          <Hatch id="{uid}-hatch" />
          <clipPath id="{uid}-clip"><rect x="0" y="0" {width} height={HEIGHT} rx="6" /></clipPath>
        </defs>
        <g clip-path="url(#{uid}-clip)">
          {#each segments as s (s.signal)}
            <rect
              class={s.signal === 'notice' ? 'notice' : ''}
              x={s.x}
              y="0"
              width={s.w}
              height={HEIGHT}
              fill={s.signal === 'silent' ? `url(#${uid}-hatch)` : undefined}
            />
          {/each}
        </g>
      </svg>
    {/if}
  </div>
  <ul class="legend" role="list">
    {#each rows as row (row.signal)}
      <li>
        <SignalSwatch signal={row.signal} />
        <span class="name t-label">{row.name}</span>
        <span class="count t-label">{breakdown.bySignal[row.signal]}</span>
        <span class="desc t-small muted">{SIGNAL_DESCRIPTIONS[row.signal]}</span>
      </li>
    {/each}
  </ul>
  {#if callout}
    <p class="callout t-body">
      <Icon name="info" size={20} />
      <span>{callout}</span>
    </p>
  {/if}
  {#if apiOnly}
    <p class="t-small muted">
      These events come from the official Case Status API, which reports status changes. Background
      updates appear only in the copied case page from USCIS.
    </p>
  {/if}
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .plot {
    min-width: 0;
  }
  svg {
    overflow: visible;
  }
  .notice {
    fill: var(--primary);
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
  }
  .legend li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0 8px;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .desc {
    grid-column: 2 / -1;
  }
  .callout {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 4px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .callout :global(svg) {
    margin-top: 2px;
  }
  @media (forced-colors: active) {
    .notice {
      fill: CanvasText;
    }
  }
</style>
