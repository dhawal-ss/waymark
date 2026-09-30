<script lang="ts">
  import {
    daysByStage,
    PIPELINE_STAGES,
    STAGE_LABELS,
    type PipelineStage,
    type StageRun,
  } from '@waymark/core';
  import { segmentWidths } from '../../lib/chart';
  import { formatDate, plural } from '../../lib/format';

  let { runs }: { runs: StageRun[] } = $props();

  const GAP = 2;
  const BAR_H = 24;
  const MARK_H = 22;
  const uid = $props.id();

  let width = $state(0);

  const current = $derived(runs.find((r) => r.open));
  const totals = $derived(daysByStage(runs));
  const totalDays = $derived(runs.reduce((sum, r) => sum + r.days, 0));
  const first = $derived(runs[0]);
  const last = $derived(runs[runs.length - 1]);
  const top = $derived(current ? MARK_H : 0);
  const height = $derived(top + BAR_H);

  const segments = $derived.by(() => {
    const avail = Math.max(0, width - GAP * (runs.length - 1));
    const widths = segmentWidths(
      runs.map((r) => r.days),
      avail,
    );
    let x = 0;
    return runs.map((run, i) => {
      const w = widths[i] ?? 0;
      const seg = { run, x, w, index: PIPELINE_STAGES.indexOf(run.stage) };
      x += w + GAP;
      return seg;
    });
  });

  const marker = $derived.by(() => {
    const seg = segments.find((s) => s.run.open);
    if (!seg) return null;
    const cx = Math.min(width - 6, Math.max(6, seg.x + seg.w / 2));
    const anchor = cx < 22 ? 'start' : cx > width - 22 ? 'end' : 'middle';
    const tx =
      anchor === 'start' ? Math.max(0, cx - 6) : anchor === 'end' ? Math.min(width, cx + 6) : cx;
    return { cx, tx, anchor };
  });

  const label = (stage: PipelineStage) => STAGE_LABELS[stage];
  const summary = $derived(
    `Journey through the stages, ${plural(totalDays, 'day')} in all. ` +
      runs.map((r) => `${label(r.stage)}, ${plural(r.days, 'day')}`).join('. ') +
      '.' +
      (current ? ` Current stage: ${label(current.stage)}.` : ''),
  );
</script>

<div class="journey">
  <div class="plot" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={summary}>
        <defs>
          <clipPath id="{uid}-clip">
            <rect x="0" y={top} {width} height={BAR_H} rx="6" />
          </clipPath>
        </defs>
        <g clip-path="url(#{uid}-clip)">
          {#each segments as s, i (i)}
            <rect
              class="segment"
              x={s.x}
              y={top}
              width={s.w}
              height={BAR_H}
              style="fill: var(--stage-{s.index})"
            >
              <title
                >{label(s.run.stage)}: {plural(s.run.days, 'day')}, {formatDate(s.run.from)} to {formatDate(
                  s.run.to,
                )}</title
              >
            </rect>
          {/each}
        </g>
        {#if marker}
          <path class="marker" d="M{marker.cx - 5} 12L{marker.cx + 5} 12L{marker.cx} 20Z" />
          <text class="axis" x={marker.tx} y="9" text-anchor={marker.anchor}>Now</text>
        {/if}
      </svg>
    {/if}
  </div>
  {#if first && last}
    <div class="ends t-small muted">
      <span>{formatDate(first.from)}</span>
      <span>{current ? 'Today' : formatDate(last.to)}</span>
    </div>
  {/if}

  <ul class="legend" role="list" aria-hidden="true">
    {#each totals as t (t.stage)}
      <li>
        <span class="key" style="background: var(--stage-{PIPELINE_STAGES.indexOf(t.stage)})"
        ></span>
        <span class="name t-body">{label(t.stage)}</span>
        {#if current?.stage === t.stage}<span class="now t-small">Current stage</span>{/if}
        <span class="days t-label">{plural(t.days, 'day')}</span>
      </li>
    {/each}
  </ul>

  <div class="visually-hidden">
    <table>
      <caption>Days in each stage, in order</caption>
      <thead>
        <tr>
          <th scope="col">Stage</th>
          <th scope="col">From</th>
          <th scope="col">To</th>
          <th scope="col">Days</th>
          <th scope="col">Current</th>
        </tr>
      </thead>
      <tbody>
        {#each runs as r, i (i)}
          <tr>
            <th scope="row">{label(r.stage)}</th>
            <td>{formatDate(r.from)}</td>
            <td>{formatDate(r.to)}</td>
            <td>{r.days}</td>
            <td>{r.open ? 'Yes' : 'No'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .journey {
    /* An ordered ramp: later stages are darker in light mode and brighter in dark mode. */
    --stage-0: color-mix(in srgb, var(--primary) 32%, var(--surface-container-low));
    --stage-1: color-mix(in srgb, var(--primary) 48%, var(--surface-container-low));
    --stage-2: color-mix(in srgb, var(--primary) 65%, var(--surface-container-low));
    --stage-3: color-mix(in srgb, var(--primary) 82%, var(--surface-container-low));
    --stage-4: var(--primary);
    position: relative;
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
  .marker {
    fill: var(--on-surface);
  }
  .axis {
    fill: var(--on-surface-variant);
    font-size: 11px;
    font-weight: 560;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0 0;
    padding: 0;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .key {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }
  .name {
    min-width: 0;
  }
  .now {
    padding: 1px 8px;
    border: 1px solid var(--outline);
    border-radius: var(--shape-full);
    color: var(--on-surface-variant);
    white-space: nowrap;
  }
  .days {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  @media (forced-colors: active) {
    .key {
      border: 1px solid CanvasText;
    }
  }
</style>
