<script lang="ts">
  import { casesSummary, isClosed, sortCases, type Case } from '@waymark/core';
  import {
    exportDeadlinesToCalendar,
    importDataFile,
    loadExample,
    removeExample,
    todayLocal,
  } from '../lib/actions';
  import { formatShortDate, plural, relativeDays } from '../lib/format';
  import { store, tz } from '../lib/stores/data.svelte';
  import { showSnackbar } from '../lib/stores/snackbar.svelte';
  import { openSheet } from '../lib/stores/ui.svelte';
  import Button from '../lib/ui/Button.svelte';
  import CaseCard from '../lib/ui/CaseCard.svelte';
  import DeadlineList from '../lib/ui/DeadlineList.svelte';
  import EmptyState from '../lib/ui/EmptyState.svelte';
  import FabMenu from '../lib/ui/FabMenu.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import TextField from '../lib/ui/TextField.svelte';

  const today = $derived(todayLocal());
  const zone = $derived(tz());
  const sorted = $derived(sortCases(store.data.cases, today, zone));
  // Search appears once the list is long enough to need it.
  const SEARCH_FROM = 6;
  let query = $state('');
  const matches = (c: Case, q: string) => {
    const needle = q
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '');
    if (!needle) return true;
    return [c.receipt, c.owner, c.form, c.form.replace('-', '')].some((v) =>
      v.toLowerCase().includes(needle),
    );
  };
  const filtered = $derived(sorted.filter((c) => matches(c, query)));
  const cases = $derived(filtered.filter((c) => !isClosed(c, zone)));
  const closed = $derived(filtered.filter((c) => isClosed(c, zone)));
  let showClosed = $state(false);
  const openDeadlines = $derived(store.data.deadlines.filter((d) => !d.done));
  const summary = $derived(casesSummary(store.data.cases, store.data.deadlines, today, zone));
  const longest = $derived(summary.longestWait);
  const hasDemo = $derived(store.data.cases.some((c) => c.demo));
  let showDone = $state(false);
  const doneCount = $derived(store.data.deadlines.filter((d) => d.done).length);
  const visibleDeadlines = $derived(store.data.deadlines.filter((d) => showDone || !d.done));

  function importLegacy() {
    if (!store.legacy) return;
    const result = importDataFile(store.legacy);
    if (!result.ok) showSnackbar(result.message);
  }
</script>

<PageHeader title="Cases" />

{#if store.storageError}
  <p class="banner" role="alert"><Icon name="error" size={20} />{store.storageError}</p>
{/if}

{#if store.ready && store.legacy && store.data.cases.length === 0}
  <section class="legacy" aria-labelledby="legacy-title">
    <h2 id="legacy-title" class="t-title">Waymark v0.2 data found in this browser</h2>
    <p class="muted">
      Import it to keep your cases, deadlines, series, and settings. The old data is not changed.
    </p>
    <div>
      <Button variant="tonal" icon="download" onclick={importLegacy}>Import v0.2 data</Button>
    </div>
  </section>
{/if}

{#if store.ready && store.data.cases.length === 0}
  <EmptyState
    icon="folder"
    title="No cases yet"
    body="Add a case with the receipt number from your receipt notice, or import the case JSON from your USCIS account."
  >
    {#snippet actions()}
      <Button icon="add" onclick={() => openSheet({ kind: 'case' })}>Add case</Button>
      <Button variant="tonal" icon="upload_file" onclick={() => openSheet({ kind: 'import' })}
        >Import USCIS JSON</Button
      >
      <Button variant="text" onclick={loadExample}>Load example</Button>
    {/snippet}
  </EmptyState>
{:else if store.data.cases.length > 0}
  <p class="summary">
    <strong class="t-headline">{summary.inProgress} in progress.</strong>
    {#if longest}<span>Longest wait {plural(longest.days, 'day')}.</span>{/if}
    {#if summary.nextDeadline}
      <span
        >Next deadline {formatShortDate(summary.nextDeadline.date, today)}, {relativeDays(
          summary.nextDeadline.date,
          today,
        )}.</span
      >
    {:else}
      <span>No upcoming deadlines.</span>
    {/if}
  </p>

  {#if hasDemo}
    <p class="demo t-small">
      <Icon name="info" size={18} />
      <span>Example data is loaded and labeled demo.</span>
      <Button variant="text" onclick={removeExample}>Remove example data</Button>
    </p>
  {/if}

  {#if store.data.cases.length >= SEARCH_FROM}
    <div class="search">
      <TextField
        label="Find a case"
        type="search"
        bind:value={query}
        autocomplete="off"
        spellcheck={false}
        supporting="Receipt number, name, or form"
      />
    </div>
  {/if}

  {#if cases.length > 0}
    <ul class="cases" role="list">
      {#each cases as c (c.id)}
        <li><CaseCard {c} {today} timeZone={zone} /></li>
      {/each}
    </ul>
  {:else if query && closed.length === 0}
    <p class="muted">No case matches "{query}". Check the receipt number or clear the search.</p>
  {:else if !query}
    <p class="muted">All cases are closed.</p>
  {/if}

  {#if closed.length > 0}
    <section class="closed" aria-labelledby="closed-title">
      <div class="section-head">
        <h2 id="closed-title" class="t-title">Closed ({closed.length})</h2>
        <Button
          variant="text"
          aria-expanded={showClosed || !!query}
          onclick={() => (showClosed = !showClosed)}
        >
          {showClosed || query ? 'Hide closed cases' : 'Show closed cases'}
        </Button>
      </div>
      {#if showClosed || query}
        <ul class="cases" role="list">
          {#each closed as c (c.id)}
            <li><CaseCard {c} {today} timeZone={zone} /></li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="deadlines" aria-labelledby="deadlines-title">
    <div class="section-head">
      <h2 id="deadlines-title" class="t-title">Deadlines</h2>
      <Button variant="text" icon="add" onclick={() => openSheet({ kind: 'deadline' })}
        >New deadline</Button
      >
    </div>
    {#if openDeadlines.length > 0}
      <div>
        <Button
          variant="outlined"
          icon="calendar_add_on"
          onclick={() => exportDeadlinesToCalendar(openDeadlines)}
        >
          Add {openDeadlines.length === 1 ? 'deadline' : `${openDeadlines.length} deadlines`} to calendar
        </Button>
      </div>
    {/if}
    {#if visibleDeadlines.length === 0}
      <p class="muted t-small">
        No open deadlines. Add one for RFE responses, biometrics, or interviews.
      </p>
    {:else}
      <DeadlineList deadlines={visibleDeadlines} {today} />
    {/if}
    {#if doneCount > 0}
      <div>
        <Button variant="text" onclick={() => (showDone = !showDone)}>
          {showDone ? 'Hide done deadlines' : `Show ${plural(doneCount, 'done deadline')}`}
        </Button>
      </div>
    {/if}
  </section>
{/if}

<FabMenu
  label="Add"
  items={[
    { label: 'New case', icon: 'add', onselect: () => openSheet({ kind: 'case' }) },
    { label: 'Import JSON', icon: 'upload_file', onselect: () => openSheet({ kind: 'import' }) },
    { label: 'New deadline', icon: 'event', onselect: () => openSheet({ kind: 'deadline' }) },
  ]}
/>
<div class="fab-space" aria-hidden="true"></div>

<style>
  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    margin-bottom: 16px;
    color: var(--on-surface-variant);
  }
  .summary strong {
    color: var(--on-surface);
  }
  .cases {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  @media (min-width: 720px) {
    .cases {
      grid-template-columns: 1fr 1fr;
    }
  }
  .search {
    margin-bottom: 12px;
  }
  .closed {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 24px;
  }
  .deadlines {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 32px;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .demo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-bottom: 12px;
    padding: 4px 4px 4px 12px;
    border-radius: var(--shape-m);
    background: var(--surface-container-highest);
  }
  .demo span {
    flex: 1;
  }
  .legacy {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
  .legacy .muted {
    color: inherit;
  }
  .banner {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
  .fab-space {
    height: 72px;
  }
</style>
