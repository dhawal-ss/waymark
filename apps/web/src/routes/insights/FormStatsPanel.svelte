<script lang="ts">
  import { quarterEndDate } from '@waymark/core';
  import { formatDate } from '../../lib/format';
  import {
    fetchFormStats,
    fetchStatForms,
    publicDataOn,
    type FormStatRecord,
  } from '../../lib/publicData';
  import { store } from '../../lib/stores/data.svelte';
  import LineChart from '../../lib/ui/LineChart.svelte';
  import Select from '../../lib/ui/Select.svelte';

  let forms = $state<string[]>([]);
  let form = $state('');
  let office = $state('');
  let records = $state<FormStatRecord[]>([]);
  let error = $state('');
  let loading = $state(false);

  $effect(() => {
    if (!publicDataOn()) return;
    loading = true;
    fetchStatForms()
      .then((r) => {
        forms = r.forms;
        const caseForms = new Set(store.data.cases.map((c) => c.form as string));
        form = forms.find((f) => caseForms.has(f)) ?? forms[0] ?? '';
        error = '';
      })
      .catch((e: unknown) => (error = e instanceof Error ? e.message : 'Loading form data failed.'))
      .finally(() => (loading = false));
  });

  $effect(() => {
    if (!form) return;
    const current = form;
    fetchFormStats(current)
      .then((r) => {
        if (current !== form) return;
        records = r.records;
        const offices = [...new Set(r.records.map((x) => x.office))];
        if (!offices.includes(office)) office = offices[0] ?? '';
      })
      .catch(
        (e: unknown) => (error = e instanceof Error ? e.message : 'Loading form data failed.'),
      );
  });

  const offices = $derived([...new Set(records.map((r) => r.office))].sort());
  const rows = $derived(records.filter((r) => r.office === office));
  const METRICS = [
    ['pending', 'Pending'],
    ['received', 'Received'],
    ['approved', 'Approved'],
    ['denied', 'Denied'],
  ] as const;
  const series = $derived(
    METRICS.map(([key, name]) => ({
      id: key,
      name,
      points: rows.flatMap((r) =>
        r[key] === null ? [] : [{ date: quarterEndDate(r.quarter), value: r[key] as number }],
      ),
    })).filter((s) => s.points.length > 0),
  );
  const sources = $derived([...new Set(rows.map((r) => r.sourceUrl))]);
  const quarters = $derived(rows.map((r) => r.quarter));
</script>

<section class="panel" aria-labelledby="stats-title">
  <h2 id="stats-title" class="t-headline">USCIS form data</h2>
  {#if !publicDataOn()}
    <p class="muted">
      Quarterly counts of received, approved, denied, and pending cases by form and office. Turn on
      public data in
      <a href="#/settings">Settings</a> to load them from the sync server.
    </p>
  {:else if loading}
    <p class="muted">Loading form data from the sync server.</p>
  {:else if error}
    <p class="alert" role="alert">{error}</p>
  {:else if forms.length === 0}
    <p class="muted">
      The sync server has no quarterly form data yet. Its maintainer imports each quarterly file
      from uscis.gov.
    </p>
  {:else}
    <div class="fields">
      <Select label="Form" bind:value={form} options={forms.map((f) => ({ value: f, label: f }))} />
      <Select
        label="Office"
        bind:value={office}
        options={offices.map((o) => ({ value: o, label: o }))}
      />
    </div>
    {#if series.length > 0}
      <LineChart
        title="{form} cases per quarter, {office}"
        {series}
        valueLabel="cases"
        formatValue={(v) => Math.round(v).toLocaleString('en-US')}
      />
      <p class="t-small muted">
        Points sit at the end of each fiscal quarter ({quarters[0]}{quarters.length > 1
          ? ` to ${quarters.at(-1)}`
          : ''}, last day {formatDate(
          quarterEndDate(quarters.at(-1) ?? quarters[0] ?? 'FY2000 Q1'),
        )}). Source:
        {#each sources as url, i (url)}<a href={url} target="_blank" rel="noopener noreferrer"
            >USCIS quarterly form data{sources.length > 1 ? ` ${i + 1}` : ''}</a
          >{i < sources.length - 1 ? ', ' : '.'}{/each}
        Counts USCIS withholds for privacy are left out.
      </p>
    {:else}
      <p class="muted">No counts for this office.</p>
    {/if}
  {/if}
</section>

<style>
  .fields {
    display: grid;
    gap: 12px;
  }
  @media (min-width: 600px) {
    .fields {
      grid-template-columns: 1fr 2fr;
    }
  }
  .alert {
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
</style>
