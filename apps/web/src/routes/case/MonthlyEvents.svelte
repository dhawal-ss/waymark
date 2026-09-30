<script lang="ts">
  import type { MonthActivity } from '@waymark/core';
  import { countTicks, linearScale, topRoundedRect } from '../../lib/chart';
  import { formatMonth, plural } from '../../lib/format';
  import ButtonGroup from '../../lib/ui/ButtonGroup.svelte';
  import Hatch from './Hatch.svelte';
  import SignalSwatch from './SignalSwatch.svelte';

  let { months }: { months: MonthActivity[] } = $props();

  const PAD = { top: 10, right: 8, bottom: 38, left: 28 };
  const HEIGHT = 190;
  const GAP = 2;
  const MAX_COLUMN = 24;
  const MIN_LABEL_SPACE = 44;
  const uid = $props.id();

  let view: 'chart' | 'table' = $state('chart');
  let width = $state(0);
  let active = $state(-1);
  let announce = $state('');

  const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

  const n = $derived(months.length);
  const yTicks = $derived(countTicks(Math.max(0, ...months.map((m) => m.notice + m.silent))));
  const yMax = $derived(yTicks[yTicks.length - 1] ?? 1);
  const base = HEIGHT - PAD.bottom;
  const plotW = $derived(Math.max(1, width - PAD.left - PAD.right));
  const band = $derived(plotW / Math.max(1, n));
  const colW = $derived(Math.min(MAX_COLUMN, Math.max(3, band - 3)));
  const y = $derived(linearScale([0, yMax], [base, PAD.top]));

  const columns = $derived(
    months.map((m, i) => {
      const cx = PAD.left + band * (i + 0.5);
      const x = cx - colW / 2;
      const hNotice = (m.notice / yMax) * (base - PAD.top);
      const hSilent = (m.silent / yMax) * (base - PAD.top);
      return { m, i, cx, x, hNotice, hSilent };
    }),
  );

  // Month names on every k-th column so labels never touch. The year shows when it changes.
  const labels = $derived.by(() => {
    const every = Math.max(1, Math.ceil(MIN_LABEL_SPACE / band));
    let previousYear = '';
    const out: { cx: number; month: string; year: string }[] = [];
    for (const col of columns) {
      if (col.i % every !== 0) continue;
      const year = col.m.month.slice(0, 4);
      out.push({
        cx: col.cx,
        month: shortMonth.format(new Date(`${col.m.month}-01T00:00:00Z`)),
        year: year === previousYear ? '' : year,
      });
      previousYear = year;
    }
    return out;
  });

  const describe = (m: MonthActivity) =>
    `${formatMonth(m.month)}: ${plural(m.notice, 'notice')}, ${plural(m.silent, 'background update')}`;

  function indexAt(event: PointerEvent): number {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const px = event.clientX - rect.left - PAD.left;
    if (px < 0 || px > plotW) return -1;
    return Math.min(n - 1, Math.floor(px / band));
  }

  function onkeydown(event: KeyboardEvent) {
    if (n === 0) return;
    let next: number;
    if (event.key === 'ArrowRight') next = Math.min(n - 1, active + 1);
    else if (event.key === 'ArrowLeft') next = active < 0 ? n - 1 : Math.max(0, active - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Escape') next = -1;
    else return;
    event.preventDefault();
    active = next;
    const m = months[next];
    announce = m ? describe(m) : '';
  }

  const activeMonth = $derived(active >= 0 ? months[active] : undefined);
  const tooltipLeft = $derived(active >= 0 ? PAD.left + band * (active + 0.5) : 0);
  const titleId = `${uid}-title`;
</script>

<div class="monthly" role="figure" aria-labelledby={titleId}>
  <div class="head">
    <h3 class="t-label caption" id={titleId}>Events per month</h3>
    <div class="switch">
      <ButtonGroup
        label="Events per month view"
        bind:value={view}
        options={[
          { value: 'chart', label: 'Chart', icon: 'show_chart' },
          { value: 'table', label: 'Table', icon: 'table_chart' },
        ]}
      />
    </div>
  </div>

  {#if view === 'chart'}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="plot"
      bind:clientWidth={width}
      role="group"
      tabindex="0"
      aria-label="Events per month. Use the left and right arrow keys to read each month."
      {onkeydown}
      onblur={() => (active = -1)}
    >
      {#if width > 0}
        <svg
          {width}
          height={HEIGHT}
          viewBox="0 0 {width} {HEIGHT}"
          aria-hidden="true"
          onpointermove={(e) => (active = indexAt(e))}
          onpointerdown={(e) => (active = indexAt(e))}
          onpointerleave={() => (active = -1)}
        >
          <defs><Hatch id="{uid}-hatch" /></defs>
          {#each yTicks as tick (tick)}
            <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text
              class="axis"
              x={PAD.left - 8}
              y={y(tick)}
              text-anchor="end"
              dominant-baseline="middle">{tick}</text
            >
          {/each}
          {#if active >= 0}
            <rect
              class="lift"
              x={PAD.left + band * active}
              y={PAD.top}
              width={band}
              height={base - PAD.top}
              rx="4"
            />
          {/if}
          {#each columns as col (col.m.month)}
            {#if col.hNotice > 0}
              {#if col.hSilent > 0}
                <rect
                  class="notice"
                  x={col.x}
                  y={base - col.hNotice}
                  width={colW}
                  height={col.hNotice}
                />
              {:else}
                <path
                  class="notice"
                  d={topRoundedRect(col.x, base - col.hNotice, colW, col.hNotice, 4)}
                />
              {/if}
            {/if}
            {#if col.hSilent > 0}
              {@const gap = col.hNotice > 0 && col.hSilent > GAP + 1 ? GAP : 0}
              <path
                class="silent"
                d={topRoundedRect(
                  col.x,
                  base - col.hNotice - col.hSilent,
                  colW,
                  col.hSilent - gap,
                  4,
                )}
                fill="url(#{uid}-hatch)"
              />
            {/if}
          {/each}
          <line class="baseline" x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} />
          {#each labels as label (label.cx)}
            <text class="axis" x={label.cx} y={base + 16} text-anchor="middle">{label.month}</text>
            {#if label.year}
              <text class="axis" x={label.cx} y={base + 30} text-anchor="middle">{label.year}</text>
            {/if}
          {/each}
        </svg>
        {#if activeMonth}
          <div
            class="tooltip"
            class:flip={tooltipLeft > width / 2}
            style="left: {tooltipLeft}px"
            aria-hidden="true"
          >
            <p class="t-small">{formatMonth(activeMonth.month)}</p>
            <p class="t-label">{plural(activeMonth.notice, 'notice')}</p>
            <p class="t-label">{plural(activeMonth.silent, 'background update')}</p>
          </div>
        {/if}
      {/if}
      <p class="visually-hidden" aria-live="polite">{announce}</p>
    </div>
    <ul class="legend" role="list">
      <li class="t-small"><SignalSwatch signal="notice" />Notices</li>
      <li class="t-small"><SignalSwatch signal="silent" />Background updates</li>
    </ul>
    {#if n === 1}
      <p class="t-small muted">All events so far fall in one month.</p>
    {/if}
  {:else}
    <div class="table-wrap">
      <table>
        <caption class="visually-hidden">Events per month, notices and background updates</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Notices</th>
            <th scope="col">Background updates</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each months as m (m.month)}
            <tr>
              <th scope="row">{formatMonth(m.month)}</th>
              <td>{m.notice}</td>
              <td>{m.silent}</td>
              <td>{m.notice + m.silent}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .monthly {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .caption {
    flex: 1 1 auto;
  }
  .switch {
    flex: 0 0 200px;
  }
  .plot {
    position: relative;
    border-radius: var(--shape-m);
  }
  svg {
    overflow: visible;
    touch-action: pan-y;
  }
  .grid {
    stroke: var(--outline-variant);
    stroke-width: 1;
  }
  .baseline {
    stroke: var(--outline);
    stroke-width: 1;
  }
  .axis {
    fill: var(--on-surface-variant);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .notice {
    fill: var(--primary);
  }
  .lift {
    fill: var(--surface-container-highest);
    opacity: 0.7;
  }
  .tooltip {
    position: absolute;
    top: 0;
    translate: 12px 0;
    z-index: 2;
    min-width: 140px;
    padding: 8px 12px;
    border-radius: var(--shape-s);
    background: var(--inverse-surface);
    color: var(--inverse-on-surface);
    box-shadow: var(--elevation-2);
    pointer-events: none;
  }
  .tooltip.flip {
    translate: calc(-100% - 12px) 0;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--on-surface-variant);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--outline-variant);
    text-align: right;
  }
  th:first-child {
    text-align: left;
  }
  thead th {
    color: var(--on-surface-variant);
    font-weight: 600;
  }
  tbody th {
    font-weight: 500;
    white-space: nowrap;
  }
  @media (forced-colors: active) {
    .notice {
      fill: CanvasText;
    }
  }
</style>
