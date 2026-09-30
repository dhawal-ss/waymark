<script lang="ts">
  import {
    isLocalDate,
    parseCutoffCsv,
    projectPriorityDate,
    STALLED_DAYS_PER_MONTH,
    toEpochDay,
    type Cutoff,
    type LocalDate,
  } from '@waymark/core';
  import { formatDate, formatMonth, plural } from '../../lib/format';
  import { mutate, store } from '../../lib/stores/data.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import ButtonGroup from '../../lib/ui/ButtonGroup.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import { relativeTime } from '../../lib/format';
  import {
    bulletinCutoffs,
    fetchBulletin,
    fetchBulletinOptions,
    publicDataOn,
    type BulletinOption,
  } from '../../lib/publicData';
  import { nowInstant } from '../../lib/stores/data.svelte';
  import { BULLETIN_CATEGORY_LABELS, BULLETIN_COUNTRY_LABELS } from '@waymark/core';
  import Checkbox from '../../lib/ui/Checkbox.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import LineChart from '../../lib/ui/LineChart.svelte';
  import Pill from '../../lib/ui/Pill.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import TextArea from '../../lib/ui/TextArea.svelte';
  import TextField from '../../lib/ui/TextField.svelte';

  const visa = $derived(store.data.visa);
  const projection = $derived(projectPriorityDate(visa.priorityDate, visa.cutoffs));
  const dated = $derived(
    visa.cutoffs.filter((c): c is Cutoff & { cutoff: LocalDate } => c.cutoff !== 'C'),
  );
  const currentMonths = $derived(visa.cutoffs.filter((c) => c.cutoff === 'C').length);

  const chartSeries = $derived.by(() => {
    const out = [
      {
        id: 'cutoff',
        name: 'Cutoff date',
        points: dated.map((c) => ({ date: `${c.month}-01`, value: toEpochDay(c.cutoff) })),
      },
    ];
    if (projection.kind === 'estimate') {
      out.push({
        id: 'trend',
        name: 'Trend (estimate)',
        points: projection.fit.map((f) => ({ date: `${f.month}-01`, value: toEpochDay(f.cutoff) })),
      });
    }
    return out;
  });
  const monthYear = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const formatCutoff = (v: number) => monthYear.format(new Date(Math.round(v) * 86_400_000));

  let pd = $state(store.data.visa.priorityDate ?? '');
  let category = $state(store.data.visa.category);
  function savePd() {
    const next = isLocalDate(pd) ? pd : undefined;
    if (next === visa.priorityDate && category.trim() === visa.category) return;
    mutate((d) => {
      d.visa.category = category.trim();
      if (next) d.visa.priorityDate = next;
      else delete d.visa.priorityDate;
    });
  }

  let sheet = $state<null | 'cutoff' | 'csv' | 'bulletin'>(null);

  // Loading cutoffs from the Visa Bulletin.
  let options = $state<BulletinOption[]>([]);
  let chart = $state<'final' | 'filing'>('final');
  let preference = $state<'family' | 'employment'>('employment');
  let bCategory = $state('');
  let bCountry = $state('');
  let bError = $state('');
  let bLoading = $state(false);
  const catLabel = (c: string) => BULLETIN_CATEGORY_LABELS[c] ?? c;
  const countryLabel = (c: string) =>
    BULLETIN_COUNTRY_LABELS[c] ?? c.replace(/_/g, ' ').toLowerCase();
  const categories = $derived([
    ...new Set(
      options
        .filter((o) => o.chart === chart && o.preference === preference)
        .map((o) => o.category),
    ),
  ]);
  const countries = $derived([
    ...new Set(
      options
        .filter((o) => o.chart === chart && o.preference === preference && o.category === bCategory)
        .map((o) => o.country),
    ),
  ]);
  $effect(() => {
    if (!categories.includes(bCategory)) bCategory = categories[0] ?? '';
  });
  $effect(() => {
    if (!countries.includes(bCountry))
      bCountry = countries.includes('ALL') ? 'ALL' : (countries[0] ?? '');
  });

  async function openBulletin() {
    sheet = 'bulletin';
    bError = '';
    bLoading = true;
    try {
      options = (await fetchBulletinOptions()).options;
      if (options.length === 0)
        bError = 'The server has no Visa Bulletin data yet. It checks travel.state.gov once a day.';
    } catch (e) {
      bError = e instanceof Error ? e.message : 'Loading the Visa Bulletin failed.';
    } finally {
      bLoading = false;
    }
  }

  async function loadBulletin(event: SubmitEvent) {
    event.preventDefault();
    if (!bCategory || !bCountry) return;
    const source = { chart, preference, category: bCategory, country: bCountry };
    try {
      const { points } = await fetchBulletin(source);
      const { cutoffs, unavailable } = bulletinCutoffs(points);
      const label = `${catLabel(bCategory)}, ${countryLabel(bCountry)}`;
      mutate(
        (d) => {
          d.visa.cutoffs = cutoffs;
          d.visa.category = label;
          d.visa.demo = false;
          d.visa.source = { kind: 'visa-bulletin', ...source, updatedAt: nowInstant() };
        },
        {
          undo: `Loaded ${plural(cutoffs.length, 'month')} from the Visa Bulletin${unavailable > 0 ? `; ${plural(unavailable, 'month')} marked unavailable were left out` : ''}.`,
        },
      );
      category = label;
      sheet = null;
    } catch (e) {
      bError = e instanceof Error ? e.message : 'Loading the cutoffs failed.';
    }
  }

  function unlinkBulletin() {
    mutate(
      (d) => {
        delete d.visa.source;
      },
      { undo: 'Stopped updating cutoffs. They stay and can be edited.' },
    );
  }
  let month = $state('');
  let cutoffDate = $state('');
  let isC = $state(false);
  let csv = $state('');
  let errors = $state<string[]>([]);
  let submitted = $state(false);
  const monthError = $derived(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? undefined : 'Enter the bulletin month.',
  );
  const cutoffError = $derived(
    isC || isLocalDate(cutoffDate) ? undefined : 'Enter the cutoff date, or check C.',
  );

  function openSheet(kind: 'cutoff' | 'csv') {
    month = '';
    cutoffDate = '';
    isC = false;
    csv = '';
    errors = [];
    submitted = false;
    sheet = kind;
  }

  function upsert(items: Cutoff[]) {
    mutate((d) => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporary inside a mutation
      const byMonth = new Map(d.visa.cutoffs.map((c) => [c.month, c.cutoff]));
      for (const c of items) byMonth.set(c.month, c.cutoff);
      d.visa.cutoffs = [...byMonth]
        .map(([m, cutoff]) => ({ month: m, cutoff }))
        .sort((a, b) => a.month.localeCompare(b.month));
    });
  }

  function addCutoff(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (monthError || cutoffError) return;
    upsert([{ month, cutoff: isC ? 'C' : cutoffDate }]);
    sheet = null;
  }

  function importCsv(event: SubmitEvent) {
    event.preventDefault();
    const { items, errors: problems } = parseCutoffCsv(csv);
    errors =
      items.length === 0 && problems.length === 0
        ? ['No rows found. Paste lines like 2025-01,2019-06-01.']
        : problems;
    if (items.length === 0) return;
    upsert(items);
    if (problems.length === 0) sheet = null;
  }

  function deleteCutoff(m: string) {
    mutate((d) => (d.visa.cutoffs = d.visa.cutoffs.filter((c) => c.month !== m)), {
      undo: `Deleted the ${formatMonth(m)} cutoff.`,
    });
  }
</script>

<section class="panel" aria-labelledby="projection-title">
  <div class="head">
    <h2 id="projection-title" class="t-headline">Priority date projection</h2>
    {#if visa.demo}<Pill label="Demo data" icon="info" />{/if}
  </div>
  <p class="muted">
    Enter your priority date and the monthly cutoff from the
    <a
      href="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html"
      target="_blank"
      rel="noopener noreferrer">Visa Bulletin</a
    >
    for your category and country.
  </p>
  <div class="fields">
    <TextField
      label="Priority date"
      type="date"
      bind:value={pd}
      onchange={savePd}
      onblur={savePd}
    />
    <TextField
      label="Category and country"
      bind:value={category}
      onblur={savePd}
      supporting="For your reference, for example EB-2, India."
    />
  </div>

  <div class="result" role="status">
    {#if projection.kind === 'no-priority-date'}
      <p>Enter your priority date to see a projection.</p>
    {:else if projection.kind === 'no-data'}
      <p>Add at least 3 months of cutoff dates to see a projection.</p>
    {:else if projection.kind === 'current'}
      <p>
        <strong>Current.</strong> Your priority date is current in the {formatMonth(
          projection.month,
        )} bulletin.
      </p>
    {:else if projection.kind === 'insufficient'}
      <p>
        Only {plural(projection.points, 'dated cutoff')} in the last 12 months. Add at least 3 to estimate
        a month.
      </p>
    {:else if projection.kind === 'stalled'}
      <p>
        The cutoff moved about {Math.max(0, Math.round(projection.daysPerMonth))} days per month over
        the last 12 months, under {STALLED_DAYS_PER_MONTH}. At that pace no useful estimate is
        possible.
      </p>
    {:else}
      <p>
        <strong>Estimated {formatMonth(projection.month)}</strong>, about {plural(
          projection.monthsAway,
          'month',
        )} after the latest bulletin. The cutoff moved about {Math.round(projection.daysPerMonth)} days
        per month over the last 12 months.
      </p>
      <p class="t-small">
        This is a straight-line estimate, not a prediction. Cutoffs can stop or move backward
        (retrogression) when annual limits are reached, and they often jump at the start of the
        fiscal year in October.
      </p>
    {/if}
  </div>

  {#if dated.length > 0}
    <LineChart
      title="Cutoff date by bulletin month"
      series={chartSeries}
      valueLabel="cutoff"
      formatValue={formatCutoff}
      reference={visa.priorityDate
        ? {
            value: toEpochDay(visa.priorityDate),
            label: `Your priority date: ${formatDate(visa.priorityDate)}`,
          }
        : undefined}
      demo={visa.demo}
    />
    {#if currentMonths > 0}
      <p class="t-small muted">
        {plural(currentMonths, 'month')} marked C (current) are not plotted.
      </p>
    {/if}
  {/if}

  {#if visa.source}
    <p class="t-small muted source">
      Cutoffs from the
      <a
        href="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html"
        target="_blank"
        rel="noopener noreferrer">Visa Bulletin</a
      >, {visa.source.chart === 'final' ? 'final action dates' : 'dates for filing'}, collected by
      the sync server. Last updated {relativeTime(visa.source.updatedAt)}. Manual changes are
      replaced when the data updates.
      <Button variant="text" onclick={unlinkBulletin}>Stop updating</Button>
    </p>
  {/if}

  <div class="row">
    {#if publicDataOn()}
      <Button variant="tonal" icon="download" onclick={openBulletin}>Load from Visa Bulletin</Button
      >
    {/if}
    <Button variant="tonal" icon="add" onclick={() => openSheet('cutoff')}>Add cutoff</Button>
    <Button variant="outlined" icon="content_paste" onclick={() => openSheet('csv')}
      >Paste CSV</Button
    >
  </div>

  {#if visa.cutoffs.length > 0}
    <details>
      <summary class="t-label">Edit cutoffs ({visa.cutoffs.length})</summary>
      <ul class="cutoffs" role="list">
        {#each [...visa.cutoffs].reverse() as c (c.month)}
          <li>
            <span>{formatMonth(c.month)}</span>
            <span>{c.cutoff === 'C' ? 'C (current)' : formatDate(c.cutoff)}</span>
            <IconButton
              icon="delete"
              label="Delete the {formatMonth(c.month)} cutoff"
              onclick={() => deleteCutoff(c.month)}
            />
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

{#if sheet === 'bulletin'}
  <Sheet open title="Load from Visa Bulletin" onclose={() => (sheet = null)}>
    <form id="bulletin-form" class="form" novalidate onsubmit={loadBulletin}>
      {#if bLoading}
        <p class="muted">Loading Visa Bulletin categories from the sync server.</p>
      {:else if options.length > 0}
        <ButtonGroup
          label="Chart"
          bind:value={chart}
          options={[
            { value: 'final', label: 'Final action' },
            { value: 'filing', label: 'Dates for filing' },
          ]}
        />
        <Select
          label="Preference"
          bind:value={preference}
          options={[
            { value: 'employment', label: 'Employment-based' },
            { value: 'family', label: 'Family-sponsored' },
          ]}
        />
        <Select
          label="Category"
          bind:value={bCategory}
          options={categories.map((c) => ({ value: c, label: catLabel(c) }))}
        />
        <Select
          label="Country of chargeability"
          bind:value={bCountry}
          options={countries.map((c) => ({ value: c, label: countryLabel(c) }))}
        />
        <p class="t-small muted">Loading replaces the cutoffs below. You can undo right after.</p>
      {/if}
      {#if bError}<ul class="errors" role="alert"><li>{bError}</li></ul>{/if}
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="bulletin-form" disabled={bLoading || !bCategory || !bCountry}
        >Load cutoffs</Button
      >
    {/snippet}
  </Sheet>
{:else if sheet === 'cutoff'}
  <Sheet open title="Add cutoff" onclose={() => (sheet = null)}>
    <form id="cutoff-form" class="form" novalidate onsubmit={addCutoff}>
      <TextField
        label="Bulletin month"
        type="month"
        bind:value={month}
        error={submitted ? monthError : undefined}
      />
      <Checkbox label="C (current)" bind:checked={isC} />
      {#if !isC}
        <TextField
          label="Cutoff date"
          type="date"
          bind:value={cutoffDate}
          error={submitted ? cutoffError : undefined}
        />
      {/if}
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="cutoff-form">Add cutoff</Button>
    {/snippet}
  </Sheet>
{:else if sheet === 'csv'}
  <Sheet open title="Paste cutoffs" onclose={() => (sheet = null)}>
    <form id="cutoff-csv" class="form" novalidate onsubmit={importCsv}>
      <TextArea
        label="Rows"
        bind:value={csv}
        mono
        rows={6}
        supporting="One month per line: month, cutoff. Months as YYYY-MM or MM/YYYY; cutoff as a date or C."
        placeholder="2025-01,2019-06-01&#10;2025-02,C"
      />
      {#if errors.length > 0}
        <ul class="errors" role="alert">
          {#each errors as e (e)}<li>{e}</li>{/each}
        </ul>
      {/if}
    </form>
    {#snippet actions()}
      <Button variant="text" onclick={() => (sheet = null)}>Cancel</Button>
      <Button type="submit" form="cutoff-csv" disabled={!csv.trim()}>Import rows</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .fields {
    display: grid;
    gap: 16px;
  }
  @media (min-width: 600px) {
    .fields {
      grid-template-columns: 1fr 1fr;
    }
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: var(--shape-l) var(--shape-s) var(--shape-l) var(--shape-s);
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  details summary {
    cursor: pointer;
    min-height: 48px;
    display: flex;
    align-items: center;
  }
  .cutoffs {
    margin: 0;
    padding: 0;
  }
  .cutoffs li {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--outline-variant);
  }
  .form {
    display: grid;
    gap: 16px;
  }
  .errors {
    margin: 0;
    padding: 12px 16px 12px 32px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
</style>
