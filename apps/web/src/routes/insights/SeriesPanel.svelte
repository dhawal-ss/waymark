<script lang="ts">
  import {
    describeChange,
    exampleData,
    isLocalDate,
    parseSeriesCsv,
    pointsInRange,
    seriesChange,
    type Range,
  } from '@waymark/core';
  import { todayLocal } from '../../lib/actions';
  import { formatDate, plural } from '../../lib/format';
  import { mutate, newId, nowInstant, store } from '../../lib/stores/data.svelte';
  import {
    fetchProcessingTimes,
    fetchTimeHistory,
    publicDataOn,
    timePoints,
    type LatestTime,
  } from '../../lib/publicData';
  import { relativeTime } from '../../lib/format';
  import Button from '../../lib/ui/Button.svelte';
  import ButtonGroup from '../../lib/ui/ButtonGroup.svelte';
  import FilterChip from '../../lib/ui/FilterChip.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import LineChart from '../../lib/ui/LineChart.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import TextArea from '../../lib/ui/TextArea.svelte';
  import TextField from '../../lib/ui/TextField.svelte';

  let range = $state<Range>('1y');
  let hidden = $state<string[]>([]);
  let sheet = $state<null | 'series' | 'point' | 'csv' | 'uscis'>(null);

  // Linking a series to official processing times.
  let latest = $state<LatestTime[]>([]);
  let uscisForm = $state('');
  let uscisChoice = $state('');
  let uscisError = $state('');
  let uscisLoading = $state(false);
  const uscisForms = $derived([...new Set(latest.map((t) => t.form))].sort());
  const uscisOptions = $derived(latest.filter((t) => t.form === uscisForm));
  const keyOf = (t: { form: string; office: string; subtype: string }) =>
    `${t.form}|${t.office}|${t.subtype}`;

  async function openUscis() {
    sheet = 'uscis';
    uscisError = '';
    uscisLoading = true;
    try {
      latest = (await fetchProcessingTimes()).items;
      const caseForms = new Set(store.data.cases.map((c) => c.form as string));
      uscisForm = latest.find((t) => caseForms.has(t.form))?.form ?? latest[0]?.form ?? '';
      uscisChoice = '';
      if (latest.length === 0)
        uscisError = 'The server has no processing times yet. It checks official pages once a day.';
    } catch (e) {
      uscisError = e instanceof Error ? e.message : 'Loading processing times failed.';
    } finally {
      uscisLoading = false;
    }
  }

  async function addLinked(event: SubmitEvent) {
    event.preventDefault();
    const t = uscisOptions.find((x) => keyOf(x) === uscisChoice);
    if (!t) {
      uscisError = 'Choose an office and category.';
      return;
    }
    try {
      const { points } = await fetchTimeHistory(t.form, t.office, t.subtype);
      const name = `${t.form} ${t.office}${t.label ? `, ${t.label}` : ''}`;
      mutate(
        (d) =>
          d.series.push({
            id: newId(),
            name,
            demo: false,
            points: timePoints(points),
            source: {
              kind: 'processing-times',
              form: t.form,
              office: t.office,
              subtype: t.subtype,
              label: t.label,
              updatedAt: nowInstant(),
            },
          }),
        { undo: `Added ${name} from USCIS processing times.` },
      );
      sheet = null;
    } catch (e) {
      uscisError = e instanceof Error ? e.message : 'Loading the history failed.';
    }
  }

  function unlink(id: string) {
    mutate(
      (d) => {
        const s = d.series.find((x) => x.id === id);
        if (s) delete s.source;
      },
      { undo: 'Stopped updating the series. Its points stay.' },
    );
  }

  const series = $derived(store.data.series);
  const visible = $derived(series.filter((s) => !hidden.includes(s.id)));
  const chartSeries = $derived(
    visible.map((s) => ({
      id: s.id,
      name: s.demo ? `${s.name} (demo)` : s.name,
      points: pointsInRange(s.points, range),
    })),
  );

  // Sheet form state
  let name = $state('');
  let target = $state('');
  let date = $state(todayLocal());
  let value = $state('');
  let csv = $state('');
  let errors = $state<string[]>([]);
  let submitted = $state(false);

  function open(kind: 'series' | 'point' | 'csv') {
    name = '';
    target = series.find((x) => !x.source)?.id ?? '';
    date = todayLocal();
    value = '';
    csv = '';
    errors = [];
    submitted = false;
    sheet = kind;
  }

  const nameError = $derived(
    name.trim() ? undefined : 'Enter a name, for example "I-485 at my field office".',
  );
  const numeric = $derived(Number(value));
  const valueError = $derived(
    value.trim() && Number.isFinite(numeric) && numeric >= 0 && numeric <= 240
      ? undefined
      : 'Enter the processing time in months.',
  );

  function createSeries(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (nameError) return;
    mutate((d) => d.series.push({ id: newId(), name: name.trim(), demo: false, points: [] }), {
      message: `Added series ${name.trim()}.`,
    });
    sheet = null;
  }

  function addPoint(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (valueError || !isLocalDate(date) || !target) return;
    mutate(
      (d) => {
        const s = d.series.find((x) => x.id === target);
        if (!s) return;
        s.points = [...s.points.filter((p) => p.date !== date), { date, value: numeric }].sort(
          (a, b) => a.date.localeCompare(b.date),
        );
      },
      { message: 'Added the point.' },
    );
    sheet = null;
  }

  function importCsv(event: SubmitEvent) {
    event.preventDefault();
    const { items, errors: problems } = parseSeriesCsv(csv);
    errors = problems;
    if (items.length === 0) {
      if (problems.length === 0) errors = ['No rows found. Paste lines like 2025-01-01,12.5.'];
      return;
    }
    const newName = name.trim();
    if (!target && !newName) {
      errors = ['Choose a series or enter a name for a new one.', ...problems];
      return;
    }
    mutate(
      (d) => {
        let s = d.series.find((x) => x.id === target);
        if (!s) {
          s = { id: newId(), name: newName, demo: false, points: [] };
          d.series.push(s);
        }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporary inside a mutation
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        for (const p of items) byDate.set(p.date, p.value);
        s.points = [...byDate]
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
      },
      { undo: `Imported ${plural(items.length, 'point')}.` },
    );
    if (problems.length === 0) sheet = null;
  }

  function deleteSeries(id: string) {
    const s = series.find((x) => x.id === id);
    if (!s) return;
    mutate((d) => (d.series = d.series.filter((x) => x.id !== id)), {
      undo: `Deleted series ${s.name}.`,
    });
  }

  function deletePoint(id: string, pointDate: string) {
    mutate(
      (d) => {
        const s = d.series.find((x) => x.id === id);
        if (s) s.points = s.points.filter((p) => p.date !== pointDate);
      },
      { undo: `Deleted the point for ${formatDate(pointDate)}.` },
    );
  }

  function loadDemo() {
    const demo = exampleData(todayLocal(), newId, nowInstant());
    mutate((d) => d.series.push(...demo.series), {
      undo: 'Loaded demo series. They are labeled demo.',
    });
  }

  // Linked series take their points from the server, so manual entry targets only the others.
  const seriesOptions = $derived(
    series
      .filter((s) => !s.source)
      .map((s) => ({ value: s.id, label: s.demo ? `${s.name} (demo)` : s.name })),
  );
</script>

<section class="panel" aria-labelledby="series-title">
  <h2 id="series-title" class="t-headline">Processing time series</h2>
  <p class="muted">
    Record published processing times over time from
    <a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noopener noreferrer"
      >egov.uscis.gov/processing-times</a
    >.
  </p>

  {#if series.length === 0}
    <p class="muted">
      No series yet. Create one and add points, paste CSV, or load demo series to see how it works.
    </p>
    <div class="row">
      <Button icon="add" onclick={() => open('series')}>New series</Button>
      <Button variant="tonal" icon="content_paste" onclick={() => open('csv')}>Paste CSV</Button>
      <Button variant="text" onclick={loadDemo}>Load demo series</Button>
      {#if publicDataOn()}
        <Button variant="outlined" icon="download" onclick={openUscis}>Add from USCIS data</Button>
      {/if}
    </div>
    {#if !publicDataOn()}
      <p class="t-small muted">
        To follow official processing times automatically, turn on public data in
        <a href="#/settings">Settings</a>.
      </p>
    {/if}
  {:else}
    <div class="row" role="group" aria-label="Series shown on the chart">
      {#each series as s (s.id)}
        <FilterChip
          label={s.demo ? `${s.name} (demo)` : s.name}
          selected={!hidden.includes(s.id)}
          onchange={(on) => (hidden = on ? hidden.filter((h) => h !== s.id) : [...hidden, s.id])}
        />
      {/each}
    </div>
    <div class="range">
      <ButtonGroup
        label="Range"
        bind:value={range}
        options={[
          { value: '3m', label: '3M' },
          { value: '6m', label: '6M' },
          { value: '1y', label: '1Y' },
          { value: 'all', label: 'All' },
        ]}
      />
    </div>
    {#if visible.length === 0}
      <p class="muted">All series are hidden. Select a chip to show a series.</p>
    {:else}
      <LineChart
        title="Processing time in months"
        series={chartSeries}
        valueLabel="months"
        demo={visible.some((s) => s.demo)}
      />
      <ul class="changes" role="list">
        {#each chartSeries as s (s.id)}
          <li class="t-small">
            <strong>{s.name}:</strong>
            {describeChange(seriesChange(s.points))}
          </li>
        {/each}
      </ul>
    {/if}
    <div class="row">
      <Button variant="tonal" icon="add" onclick={() => open('point')}>Add point</Button>
      <Button variant="outlined" icon="content_paste" onclick={() => open('csv')}>Paste CSV</Button>
      <Button variant="text" icon="add" onclick={() => open('series')}>New series</Button>
      {#if publicDataOn()}
        <Button variant="outlined" icon="download" onclick={openUscis}>Add from USCIS data</Button>
      {/if}
    </div>
    {#if visible.some((s) => s.source)}
      <p class="t-small muted">
        Linked series follow the time USCIS publishes for 80% of cases at
        <a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noopener noreferrer"
          >egov.uscis.gov</a
        >, one point per publication date, collected daily by the sync server.
      </p>
    {/if}
    <details class="manage">
      <summary class="t-label">Edit series and points</summary>
      {#each series as s (s.id)}
        <div class="series-edit">
          <div class="series-head">
            <span class="t-title">{s.name}{s.demo ? ' (demo)' : ''}</span>
            {#if s.source}
              <Button variant="text" onclick={() => unlink(s.id)}>Stop updating</Button>
            {/if}
            <Button variant="text" icon="delete" onclick={() => deleteSeries(s.id)}
              >Delete series</Button
            >
          </div>
          {#if s.source}
            <p class="t-small muted">
              Updates from USCIS processing times ({s.source.form}, {s.source.office}{s.source
                .subtype
                ? `, ${s.source.subtype}`
                : ''}). Last updated {relativeTime(s.source.updatedAt)}. Points cannot be edited
              while linked.
            </p>
          {/if}
          {#if s.points.length === 0}
            <p class="t-small muted">No points.</p>
          {:else if s.source}
            <ul class="points" role="list">
              {#each [...s.points].reverse() as p (p.date)}
                <li class="linked">
                  <span>{formatDate(p.date)}</span><span>{p.value} months</span>
                </li>
              {/each}
            </ul>
          {:else}
            <ul class="points" role="list">
              {#each [...s.points].reverse() as p (p.date)}
                <li>
                  <span>{formatDate(p.date)}</span>
                  <span>{p.value} months</span>
                  <IconButton
                    icon="delete"
                    label="Delete point {formatDate(p.date)} from {s.name}"
                    onclick={() => deletePoint(s.id, p.date)}
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </details>
  {/if}
</section>

{#if sheet === 'uscis'}
  <Sheet open title="Add from USCIS data" onclose={() => (sheet = null)}>
    <form id="uscis-form" class="form" novalidate onsubmit={addLinked}>
      {#if uscisLoading}
        <p class="muted">Loading processing times from the sync server.</p>
      {:else if latest.length > 0}
        <Select
          label="Form"
          bind:value={uscisForm}
          options={uscisForms.map((f) => ({ value: f, label: f }))}
        />
        <fieldset class="choices">
          <legend class="t-label">Office and category</legend>
          {#each uscisOptions as t (keyOf(t))}
            <label class="choice">
              <input type="radio" name="uscis-choice" value={keyOf(t)} bind:group={uscisChoice} />
              <span>
                <span class="t-body"
                  >{t.office}{t.label ? `, ${t.label}` : t.subtype ? `, ${t.subtype}` : ''}</span
                >
                <span class="t-small muted">
                  {t.months === null
                    ? t.lastError
                      ? `Not available: ${t.lastError}`
                      : 'Not checked yet'
                    : `${t.months} months${t.publishedDate ? `, published ${formatDate(t.publishedDate)}` : ''}`}
                </span>
              </span>
            </label>
          {/each}
        </fieldset>
      {/if}
      {#if uscisError}<p class="errors" role="alert">{uscisError}</p>{/if}
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="uscis-form" disabled={uscisLoading || !uscisChoice}
        >Add series</Button
      >
    {/snippet}
  </Sheet>
{:else if sheet === 'series'}
  <Sheet open title="New series" onclose={() => (sheet = null)}>
    <form id="series-form" novalidate onsubmit={createSeries}>
      <TextField label="Name" bind:value={name} error={submitted ? nameError : undefined} />
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="series-form">Create series</Button>
    {/snippet}
  </Sheet>
{:else if sheet === 'point'}
  <Sheet open title="Add point" onclose={() => (sheet = null)}>
    <form id="point-form" class="form" novalidate onsubmit={addPoint}>
      <Select label="Series" bind:value={target} options={seriesOptions} />
      <TextField label="Date" type="date" bind:value={date} />
      <TextField
        label="Processing time, months"
        bind:value
        inputmode="decimal"
        error={submitted ? valueError : undefined}
      />
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="point-form">Add point</Button>
    {/snippet}
  </Sheet>
{:else if sheet === 'csv'}
  <Sheet open title="Paste CSV" onclose={() => (sheet = null)}>
    <form id="csv-form" class="form" novalidate onsubmit={importCsv}>
      <Select
        label="Add to"
        bind:value={target}
        options={[{ value: '', label: 'New series' }, ...seriesOptions]}
      />
      {#if !target}<TextField label="New series name" bind:value={name} />{/if}
      <TextArea
        label="Rows"
        bind:value={csv}
        mono
        rows={6}
        supporting="One point per line: date, months. Dates as YYYY-MM-DD or MM/DD/YYYY."
        placeholder="2025-01-01,12.5&#10;2025-02-01,13"
      />
      {#if errors.length > 0}
        <ul class="errors" role="alert">
          {#each errors as e (e)}<li>{e}</li>{/each}
        </ul>
      {/if}
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="csv-form" disabled={!csv.trim()}>Import rows</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .range {
    max-width: 320px;
  }
  .changes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
  }
  .form {
    display: grid;
    gap: 16px;
  }
  .manage summary {
    cursor: pointer;
    min-height: 48px;
    display: flex;
    align-items: center;
  }
  .series-edit {
    margin-top: 12px;
  }
  .series-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .points {
    margin: 0;
    padding: 0;
  }
  .points li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--outline-variant);
    font-variant-numeric: tabular-nums;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .choices legend {
    margin-bottom: 8px;
    color: var(--on-surface-variant);
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 48px;
    padding: 8px 12px;
    border-radius: var(--shape-m);
    cursor: pointer;
  }
  .choice:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .choice input {
    width: 20px;
    height: 20px;
    margin: 2px 0 0;
    accent-color: var(--primary);
  }
  .choice > span {
    display: flex;
    flex-direction: column;
  }
  .points li.linked {
    grid-template-columns: 1fr auto;
    min-height: 40px;
  }
  .errors {
    margin: 0;
    padding: 12px 16px 12px 32px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
</style>
