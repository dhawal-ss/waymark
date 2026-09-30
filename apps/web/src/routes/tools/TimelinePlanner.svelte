<script lang="ts">
  import { addDays, isLocalDate, processingDays } from '@waymark/core';
  import { todayLocal } from '../../lib/actions';
  import { formatDate, relativeDays } from '../../lib/format';
  import TextField from '../../lib/ui/TextField.svelte';

  let received = $state('');
  let months = $state('');
  let p80 = $state('');
  const today = todayLocal();

  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const valid = (n: number) => Number.isFinite(n) && n > 0 && n <= 120;
  const monthsError = $derived(
    months.trim() && !valid(num(months)) ? 'Enter months between 0.5 and 120.' : undefined,
  );
  const p80Error = $derived(
    p80.trim() && !valid(num(p80))
      ? 'Enter months between 0.5 and 120, or leave it empty.'
      : undefined,
  );

  const rows = $derived.by(() => {
    if (!isLocalDate(received)) return [];
    const out: { label: string; date: string }[] = [];
    if (valid(num(months)))
      out.push({
        label: 'Published processing time ends',
        date: addDays(received, processingDays(num(months))),
      });
    if (valid(num(p80)))
      out.push({
        label: '80% of cases decided by',
        date: addDays(received, processingDays(num(p80))),
      });
    return out;
  });
</script>

<section class="panel" aria-labelledby="plan-title">
  <h2 id="plan-title" class="t-headline">Timeline planner</h2>
  <p class="muted t-small">
    Enter times from <a
      href="https://egov.uscis.gov/processing-times/"
      target="_blank"
      rel="noopener noreferrer">egov.uscis.gov/processing-times</a
    >. Months count as 30.44 days.
  </p>
  <div class="fields">
    <TextField label="Received date" type="date" bind:value={received} />
    <TextField
      label="Published time, months"
      bind:value={months}
      inputmode="decimal"
      error={monthsError}
    />
    <TextField
      label="80th percentile, months"
      bind:value={p80}
      inputmode="decimal"
      supporting="Optional."
      error={p80Error}
    />
  </div>
  <div role="status">
    {#if !isLocalDate(received)}
      <p class="muted">Enter the received date to see dates.</p>
    {:else if rows.length === 0}
      <p class="muted">Enter a processing time to see dates.</p>
    {:else}
      <dl class="dates">
        {#each rows as r (r.label)}
          <div>
            <dt class="t-small">{r.label}</dt>
            <dd>
              <span class="t-title-large">{formatDate(r.date)}</span>
              <span class="muted">{relativeDays(r.date, today)}</span>
            </dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
</section>

<style>
  .fields {
    display: grid;
    gap: 16px;
  }
  @media (min-width: 720px) {
    .fields {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .dates {
    display: grid;
    gap: 8px;
    margin: 0;
  }
  .dates div {
    padding: 12px 16px;
    border-radius: var(--shape-l);
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .dates .muted {
    color: inherit;
  }
  dd {
    margin: 0;
  }
</style>
