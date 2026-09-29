<script lang="ts" module>
  export interface ChartPoint {
    date: string;
    value: number;
  }

  export interface ChartSeries {
    id: string;
    name: string;
    points: ChartPoint[];
  }

  export interface ChartReference {
    value: number;
    label: string;
  }
</script>

<script lang="ts">
  import { toEpochDay } from '@waymark/core';
  import { linearScale, monthTicks, nearestIndex, niceTicks } from '../chart';
  import ButtonGroup from './ButtonGroup.svelte';
  import Pill from './Pill.svelte';

  interface Props {
    title: string;
    series: ChartSeries[];
    /** Unit label for values, used in the table header and screen reader text. */
    valueLabel: string;
    formatValue?: (value: number) => string;
    reference?: ChartReference;
    demo?: boolean;
    height?: number;
  }

  let {
    title,
    series,
    valueLabel,
    formatValue = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)),
    reference,
    demo = false,
    height = 240,
  }: Props = $props();

  const PAD = { top: 12, right: 16, bottom: 28, left: 44 };
  const DASHES = ['', '7 5', '2 4', '12 4 2 4'];
  const DAY_MS = 86_400_000;

  let view: 'chart' | 'table' = $state('chart');
  const titleId = `chart-${Math.random().toString(36).slice(2, 8)}`;
  let width = $state(0);
  let active = $state(-1);
  let announce = $state('');

  const monthFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const formatDay = (day: number) => dayFmt.format(new Date(day * DAY_MS));

  const prepared = $derived(
    series.map((s) => ({
      ...s,
      pts: s.points
        .map((p) => ({ day: toEpochDay(p.date), value: p.value }))
        .sort((a, b) => a.day - b.day),
    })),
  );

  const days = $derived(
    [...new Set(prepared.flatMap((s) => s.pts.map((p) => p.day)))].sort((a, b) => a - b),
  );
  const values = $derived([
    ...prepared.flatMap((s) => s.pts.map((p) => p.value)),
    ...(reference ? [reference.value] : []),
  ]);
  const hasData = $derived(days.length > 0);

  const xDomain = $derived.by((): [number, number] => {
    const first = days[0] ?? 0;
    const last = days[days.length - 1] ?? 0;
    return first === last ? [first - 15, last + 15] : [first, last];
  });
  const yTicks = $derived(niceTicks(Math.min(...values), Math.max(...values), 5));
  const yDomain = $derived<[number, number]>([yTicks[0] ?? 0, yTicks[yTicks.length - 1] ?? 1]);
  const x = $derived(linearScale(xDomain, [PAD.left, Math.max(PAD.left + 1, width - PAD.right)]));
  const y = $derived(linearScale(yDomain, [height - PAD.bottom, PAD.top]));
  const xTicks = $derived(monthTicks(xDomain[0], xDomain[1], width < 480 ? 4 : 6));

  const paths = $derived(
    prepared.map((s) =>
      s.pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`)
        .join(''),
    ),
  );

  const activeDay = $derived(active >= 0 ? days[active] : undefined);
  const activeRows = $derived(
    activeDay === undefined
      ? []
      : prepared.flatMap((s, i) => {
          const p = s.pts.find((pt) => pt.day === activeDay);
          return p ? [{ name: s.name, value: p.value, index: i }] : [];
        }),
  );

  function describe(index: number): string {
    const day = days[index];
    if (day === undefined) return '';
    const rows = prepared.flatMap((s) => {
      const p = s.pts.find((pt) => pt.day === day);
      return p ? [`${s.name} ${formatValue(p.value)} ${valueLabel}`] : [];
    });
    return `${formatDay(day)}: ${rows.join(', ')}`;
  }

  function onpointermove(event: PointerEvent) {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const span = xDomain[1] - xDomain[0];
    const day = xDomain[0] + ((px - PAD.left) / Math.max(1, width - PAD.left - PAD.right)) * span;
    active = nearestIndex(days, day);
  }

  function onkeydown(event: KeyboardEvent) {
    if (!hasData) return;
    let next: number;
    if (event.key === 'ArrowRight') next = Math.min(days.length - 1, active + 1);
    else if (event.key === 'ArrowLeft')
      next = active < 0 ? days.length - 1 : Math.max(0, active - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = days.length - 1;
    else if (event.key === 'Escape') next = -1;
    else return;
    event.preventDefault();
    active = next;
    announce = next >= 0 ? describe(next) : '';
  }

  const tooltipLeft = $derived(activeDay === undefined ? 0 : x(activeDay));
</script>

<div class="chart" role="figure" aria-labelledby={titleId}>
  <div class="head">
    <p class="t-title caption" id={titleId}>{title}</p>
    {#if demo}<Pill label="Demo data" icon="info" />{/if}
    <div class="switch">
      <ButtonGroup
        label="{title} view"
        bind:value={view}
        options={[
          { value: 'chart', label: 'Chart', icon: 'show_chart' },
          { value: 'table', label: 'Table', icon: 'table_chart' },
        ]}
      />
    </div>
  </div>

  {#if !hasData}
    <p class="empty muted">No data points yet.</p>
  {:else if view === 'chart'}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="plot"
      bind:clientWidth={width}
      role="group"
      tabindex="0"
      aria-label="{title}. Use the left and right arrow keys to read values."
      {onkeydown}
      onblur={() => (active = -1)}
    >
      {#if width > 0}
        <svg
          {width}
          {height}
          viewBox="0 0 {width} {height}"
          aria-hidden="true"
          {onpointermove}
          onpointerleave={() => (active = -1)}
        >
          {#each yTicks as tick (tick)}
            <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text
              class="axis"
              x={PAD.left - 8}
              y={y(tick)}
              text-anchor="end"
              dominant-baseline="middle"
            >
              {formatValue(tick)}
            </text>
          {/each}
          {#each xTicks as tick (tick)}
            <text class="axis" x={x(tick)} y={height - 8} text-anchor="middle">
              {monthFmt.format(new Date(tick * DAY_MS))}
            </text>
          {/each}
          {#if reference}
            <line
              class="ref"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(reference.value)}
              y2={y(reference.value)}
            />
            <text
              class="ref-label"
              x={width - PAD.right}
              y={y(reference.value) - 6}
              text-anchor="end"
            >
              {reference.label}
            </text>
          {/if}
          {#each prepared as s, i (s.id)}
            <path
              class="line"
              d={paths[i]}
              style="stroke: var(--chart-{i % 4})"
              stroke-dasharray={DASHES[i % DASHES.length]}
            />
            {#if s.pts.length <= 40}
              {#each s.pts as p (p.day)}
                <circle
                  class="mark"
                  cx={x(p.day)}
                  cy={y(p.value)}
                  r="3"
                  style="fill: var(--chart-{i % 4})"
                />
              {/each}
            {/if}
          {/each}
          {#if activeDay !== undefined}
            <line
              class="cursor"
              x1={x(activeDay)}
              x2={x(activeDay)}
              y1={PAD.top}
              y2={height - PAD.bottom}
            />
            {#each activeRows as row (row.name)}
              <circle
                class="active-dot"
                cx={x(activeDay)}
                cy={y(row.value)}
                r="6"
                style="fill: var(--chart-{row.index % 4})"
              />
            {/each}
          {/if}
        </svg>
        {#if activeDay !== undefined}
          <div
            class="tooltip"
            class:flip={tooltipLeft > width / 2}
            style="left: {tooltipLeft}px"
            aria-hidden="true"
          >
            <p class="t-small">{formatDay(activeDay)}</p>
            {#each activeRows as row (row.name)}
              <p class="t-label">
                {#if prepared.length > 1}<span
                    class="swatch"
                    style="background: var(--chart-{row.index % 4})"
                  ></span>{row.name}:
                {/if}{formatValue(row.value)}
                {valueLabel}
              </p>
            {/each}
          </div>
        {/if}
      {/if}
      <p class="visually-hidden" aria-live="polite">{announce}</p>
    </div>
    {#if prepared.length > 1}
      <ul class="legend" role="list">
        {#each prepared as s, i (s.id)}
          <li class="t-small">
            <svg width="24" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="24"
                y1="4"
                y2="4"
                style="stroke: var(--chart-{i % 4})"
                stroke-dasharray={DASHES[i % DASHES.length]}
              />
            </svg>
            {s.name}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <div class="table-wrap">
      <table>
        <caption class="visually-hidden">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {#each prepared as s (s.id)}<th scope="col">{s.name} ({valueLabel})</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each days as day (day)}
            <tr>
              <th scope="row">{formatDay(day)}</th>
              {#each prepared as s (s.id)}
                {@const p = s.pts.find((pt) => pt.day === day)}
                <td>{p ? formatValue(p.value) : ''}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .chart {
    --chart-0: var(--primary);
    --chart-1: var(--tertiary);
    --chart-2: var(--success);
    --chart-3: var(--error);
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
  .axis {
    fill: var(--on-surface-variant);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mark {
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .ref {
    stroke: var(--on-surface);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
  }
  .ref-label {
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 4px;
    stroke-linejoin: round;
    fill: var(--on-surface);
    font-size: 11px;
    font-weight: 600;
  }
  .cursor {
    stroke: var(--on-surface-variant);
    stroke-width: 1;
  }
  .active-dot {
    stroke: var(--surface);
    stroke-width: 2;
  }
  .tooltip {
    position: absolute;
    top: 0;
    translate: 12px 0;
    z-index: 2;
    min-width: 120px;
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
  .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 50%;
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
  .legend line {
    stroke-width: 3;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 8px 12px;
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
  }
  .empty {
    padding: 24px 0;
  }
</style>
