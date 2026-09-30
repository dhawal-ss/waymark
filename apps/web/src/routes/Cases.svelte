<script lang="ts">
  import { casesSummary, isClosed, newEventCount, sortCases, type Case } from '@waymark/core';
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
  import { backupDue, daysSinceBackup, exportBackup, snoozeBackup } from '../lib/backup.svelte';
  import { install, promptInstall } from '../lib/install.svelte';

  const today = $derived(todayLocal());
  const zone = $derived(tz());
  const sorted = $derived(sortCases(store.data.cases, today, zone));
  // Search appears once the list is long enough to need it.
  const SEARCH_FROM = 6;
  let query = $state('');
  // Compare letters and digits only, so "IOE 0123", "i-485", and "mary jane" all match.
  const plain = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const matches = (c: Case, q: string) => {
    const needle = plain(q);
    if (!needle) return true;
    return [c.receipt, c.owner, c.form].some((v) => plain(v).includes(needle));
  };
  const filtered = $derived(sorted.filter((c) => matches(c, query)));
  const cases = $derived(filtered.filter((c) => !isClosed(c, zone)));
  const closed = $derived(filtered.filter((c) => isClosed(c, zone)));
  let showClosed = $state(false);
  const openDeadlines = $derived(store.data.deadlines.filter((d) => !d.done));
  const summary = $derived(casesSummary(store.data.cases, store.data.deadlines, today, zone));
  const withNews = $derived(store.data.cases.filter((c) => newEventCount(c) > 0).length);
  const hasDemo = $derived(store.data.cases.some((c) => c.demo));
  let showDone = $state(false);
  const doneCount = $derived(store.data.deadlines.filter((d) => d.done).length);
  const visibleDeadlines = $derived(store.data.deadlines.filter((d) => showDone || !d.done));

  const INSTALL_KEY = 'waymark:install-dismissed';
  let installDismissed = $state(
    (() => {
      try {
        return localStorage.getItem(INSTALL_KEY) === '1';
      } catch {
        return false;
      }
    })(),
  );
  function dismissInstall() {
    installDismissed = true;
    try {
      localStorage.setItem(INSTALL_KEY, '1');
    } catch {
      // Storage blocked: the card comes back next time.
    }
  }
  const lastBackup = $derived(daysSinceBackup(today));

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
    {#if withNews > 0}
      <strong class="t-headline news"
        >{withNews === 1 ? '1 case has' : `${withNews} cases have`} new USCIS events.</strong
      >
      <span>{summary.inProgress} in progress.</span>
    {:else}
      <strong class="t-headline">{summary.inProgress} in progress.</strong>
    {/if}
    {#if summary.nextDeadline}
      {@const next = summary.nextDeadline}
      <span class:overdue={next.date < today}
        >{next.date < today ? 'Overdue' : 'Next deadline'}: {next.title}, {formatShortDate(
          next.date,
          today,
        )}, {relativeDays(next.date, today)}.</span
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

  {#if install.available && !installDismissed}
    <section class="card-note" aria-labelledby="install-title">
      <h2 id="install-title" class="t-title">Install Waymark on this phone</h2>
      <p class="t-small">
        Opens from the home screen, works offline, and lets you share the case JSON from Chrome to
        Waymark.
      </p>
      <div class="note-actions">
        <Button icon="mobile_arrow_down" onclick={() => promptInstall()}>Install app</Button>
        <Button variant="text" onclick={dismissInstall}>Not now</Button>
      </div>
    </section>
  {:else if backupDue(today)}
    <section class="card-note" aria-labelledby="backup-title">
      <h2 id="backup-title" class="t-title">Back up your cases</h2>
      <p class="t-small">
        Your data is stored only on this device{lastBackup === null
          ? ' and has not been exported yet'
          : `. The last backup was ${plural(lastBackup, 'day')} ago`}. Export a file to keep a copy.
      </p>
      <div class="note-actions">
        <Button icon="download" onclick={() => exportBackup({ share: true })}>Export backup</Button>
        <Button variant="text" onclick={() => snoozeBackup(today)}>Remind me next week</Button>
      </div>
    </section>
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
  .summary .news {
    color: var(--primary);
  }
  .summary .overdue {
    color: var(--error);
    font-weight: 600;
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
  .card-note {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    padding: 16px 16px 12px;
    border-radius: var(--shape-xl);
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .note-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
</style>
