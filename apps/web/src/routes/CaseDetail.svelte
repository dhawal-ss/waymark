<script lang="ts">
  import {
    appointmentSuggestions,
    caseStats,
    caseSummaryLine,
    CATEGORY_LABELS,
    currentStatus,
    daysSinceFiling,
    milestones as buildMilestones,
    newEventCount,
    processingDays,
    STATUS_KEYS,
    STATUSES,
    timeline as buildTimeline,
    waitPosition,
  } from '@waymark/core';
  import {
    addAppointmentDeadline,
    copyText,
    deleteCase,
    exportDeadlinesToCalendar,
    deleteManualEntry,
    markCaseSeen,
    todayLocal,
    updateCase,
  } from '../lib/actions';
  import { formatDate, formatDateTime, plural, relativeTime } from '../lib/format';
  import { flushSaves, store, tz } from '../lib/stores/data.svelte';
  import { navigate } from '../lib/stores/router.svelte';
  import { openSheet } from '../lib/stores/ui.svelte';
  import { startSync } from '../lib/sync';
  import Button from '../lib/ui/Button.svelte';
  import DeadlineList from '../lib/ui/DeadlineList.svelte';
  import EmptyState from '../lib/ui/EmptyState.svelte';
  import FloatingToolbar from '../lib/ui/FloatingToolbar.svelte';
  import FormBadge from '../lib/ui/FormBadge.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import MilestoneTrack from '../lib/ui/MilestoneTrack.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import Pill from '../lib/ui/Pill.svelte';
  import Receipt from '../lib/ui/Receipt.svelte';
  import ServerTracking from '../lib/ui/ServerTracking.svelte';
  import { syncEnabled } from '../lib/serverSync.svelte';
  import { fetchProcessingTimes, publicDataOn, type LatestTime } from '../lib/publicData';
  import SplitButton from '../lib/ui/SplitButton.svelte';
  import StatusPill from '../lib/ui/StatusPill.svelte';
  import TextArea from '../lib/ui/TextArea.svelte';
  import TextField from '../lib/ui/TextField.svelte';
  import WavyProgress from '../lib/ui/WavyProgress.svelte';

  let { id }: { id: string } = $props();

  const c = $derived(store.data.cases.find((x) => x.id === id));
  const today = $derived(todayLocal());
  const zone = $derived(tz());
  const status = $derived(c ? currentStatus(c, zone) : 'received');
  const info = $derived(STATUSES[status]);
  const days = $derived(c ? daysSinceFiling(c, today) : 0);
  const wait = $derived(c ? waitPosition(c, today) : null);
  const stats = $derived(c ? caseStats(c, today, zone) : null);
  const items = $derived(c ? buildTimeline(c, zone) : []);
  const fresh = $derived(c ? newEventCount(c) : 0);
  const marks = $derived(c ? buildMilestones(c, today, zone) : []);
  const span = $derived(
    c
      ? Math.max(
          1,
          days,
          c.processingMonths ? processingDays(c.processingMonths) : 0,
          ...items.map((i) => i.day),
        )
      : 1,
  );
  const deadlines = $derived(store.data.deadlines.filter((d) => d.caseId === id));
  const openDeadlines = $derived(deadlines.filter((d) => !d.done));
  const appointments = $derived(
    c ? appointmentSuggestions(c, store.data.deadlines, today, zone) : [],
  );

  // Published processing times for this form from the sync server, when public data is on.
  let published = $state<LatestTime[]>([]);
  $effect(() => {
    const form = c?.form;
    if (!form || form === 'Other' || !publicDataOn()) return;
    fetchProcessingTimes(form)
      .then((r) => (published = r.items.filter((t) => t.months !== null)))
      .catch(() => (published = []));
  });
  function useMonths(value: number) {
    months = String(value);
    updateCase(id, { processingMonths: value }, `Set the processing time to ${value} months.`);
  }

  // Notes autosave after a pause in typing.
  let notes = $state(store.data.cases.find((x) => x.id === id)?.notes ?? '');
  let notesState = $state<'idle' | 'pending' | 'saved'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  function onNotes() {
    notesState = 'pending';
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateCase(id, { notes });
      void flushSaves().then(() => {
        if (notesState === 'pending') notesState = 'saved';
      });
    }, 600);
  }
  $effect(() => () => {
    if (notesState === 'pending') {
      clearTimeout(timer);
      updateCase(id, { notes });
    }
  });

  // Processing time for "Where you sit" saves when the field is valid.
  let months = $state(String(store.data.cases.find((x) => x.id === id)?.processingMonths ?? ''));
  const monthsValue = $derived(months.trim() === '' ? undefined : Number(months));
  const monthsError = $derived(
    monthsValue !== undefined &&
      (!Number.isFinite(monthsValue) || monthsValue <= 0 || monthsValue > 120)
      ? 'Enter a number of months between 0.5 and 120.'
      : undefined,
  );
  function saveMonths() {
    if (!c || monthsError || monthsValue === c.processingMonths) return;
    updateCase(id, { processingMonths: monthsValue });
  }

  function remove() {
    deleteCase(id);
    navigate('/cases');
  }

  const QUICK = STATUS_KEYS.filter((k) => k !== 'received');
</script>

{#if !c}
  <PageHeader title="Case not found" back={{ href: '#/cases', label: 'Back to cases' }} />
  <EmptyState
    icon="folder"
    title="This case does not exist"
    body="It may have been deleted, or the link is from another device."
  >
    {#snippet actions()}
      <Button href="#/cases" icon="arrow_back">Back to cases</Button>
    {/snippet}
  </EmptyState>
{:else}
  <PageHeader title={c.owner || c.form} back={{ href: '#/cases', label: 'Back to cases' }} />

  <section class="hero tone-{info.tone}" aria-label="Case summary">
    <div class="hero-top">
      <FormBadge form={c.form} size={56} />
      <div class="hero-id">
        <span class="t-title-large">{c.form}</span>
        <span class="receipt-row">
          <Receipt receipt={c.receipt} />
          <IconButton
            icon="content_copy"
            label="Copy receipt number"
            onclick={() => copyText(c.receipt, `Copied ${c.receipt}.`)}
          />
        </span>
      </div>
      {#if c.demo}<Pill label="Demo" icon="info" />{/if}
    </div>
    <p class="counter">
      <span class="t-counter">{days}</span>
      <span class="t-body"
        >{days === 1 ? 'day' : 'days'} since filing on {formatDate(c.receivedDate)}</span
      >
    </p>
    {#if wait}
      <WavyProgress
        value={wait.elapsed}
        max={wait.total}
        label="Time since filing against processing time"
        valueText="{wait.elapsed} of {wait.total} days"
        animate
      />
      <p class="t-small">
        {wait.remaining >= 0
          ? `${plural(wait.remaining, 'day')} left of the ${c.processingMonths}-month processing time`
          : `${plural(-wait.remaining, 'day')} past the ${c.processingMonths}-month processing time`}
      </p>
    {/if}
    <div class="hero-actions">
      <StatusPill {status} />
      <SplitButton
        label="Log a status"
        icon="add"
        menuLabel="Quick statuses"
        onclick={() => openSheet({ kind: 'status', caseId: id })}
        items={QUICK.map((k) => ({
          label: STATUSES[k].label,
          onselect: () => openSheet({ kind: 'status', caseId: id, status: k }),
        }))}
      />
    </div>
  </section>

  <section class="panel" aria-labelledby="uscis-title">
    <div class="panel-head">
      <h2 id="uscis-title" class="t-title">USCIS data</h2>
      {#if fresh > 0}<Pill label="{fresh} new" tone="new" />{/if}
    </div>
    {#if c.uscis}
      <p class="muted">
        Last synced {relativeTime(c.uscis.lastSyncedAt)}. {plural(c.uscis.events.length, 'event')}{c
          .uscis.closed
          ? '. USCIS marks this case closed.'
          : '.'}
      </p>
    {:else}
      <p class="muted">
        Not synced. Import the case JSON from your USCIS account to add official events.
      </p>
    {/if}
    <div class="row">
      <Button variant="tonal" icon="sync" onclick={() => startSync(c.receipt, c.id)}>Sync</Button>
      <Button
        variant="outlined"
        icon="content_paste"
        onclick={() => openSheet({ kind: 'import', caseId: c.id })}>Paste JSON</Button
      >
      {#if fresh > 0}<Button variant="text" icon="check" onclick={() => markCaseSeen(c.id)}
          >Mark {fresh} seen</Button
        >{/if}
    </div>
    <p class="t-small muted">
      Sync opens your case JSON on my.uscis.gov in a new tab. Copy the page, come back, and choose
      Import. Event meanings are community documented, not official.
    </p>
    {#if syncEnabled()}<ServerTracking {c} />{/if}
  </section>

  {#if stats}
    <dl class="stats">
      <div>
        <dt class="t-small">Since last event</dt>
        <dd>
          {stats.daysSinceLastEvent === null ? 'None' : plural(stats.daysSinceLastEvent, 'day')}
        </dd>
      </div>
      <div>
        <dt class="t-small">Events</dt>
        <dd>{stats.events}</dd>
      </div>
      <div>
        <dt class="t-small">Notices</dt>
        <dd>{stats.notices}</dd>
      </div>
    </dl>
  {/if}

  <section class="panel" aria-labelledby="milestones-title">
    <h2 id="milestones-title" class="t-title">Milestones</h2>
    <MilestoneTrack
      milestones={marks}
      todayPosition={Math.min(1, days / span)}
      expectedPosition={c.processingMonths
        ? Math.min(1, processingDays(c.processingMonths) / span)
        : undefined}
    />
  </section>

  <div class="pair">
    <section class="panel meaning" aria-labelledby="meaning-title">
      <h2 id="meaning-title" class="t-title">What this means</h2>
      <p>{info.meaning}</p>
    </section>
    <section class="panel" aria-labelledby="next-title">
      <h2 id="next-title" class="t-title">What usually happens next</h2>
      <p>{info.next}</p>
    </section>
  </div>

  {#if appointments.length > 0}
    <section class="panel appointments" aria-labelledby="appointments-title">
      <h2 id="appointments-title" class="t-title">Upcoming appointments</h2>
      <ul class="notices" role="list">
        {#each appointments as a (a.key)}
          <li class="appointment">
            <span class="t-body">{a.title}</span>
            <span class="t-small">{formatDateTime(a.instant, zone)}</span>
            <div>
              <Button
                variant="tonal"
                icon="event"
                onclick={() => addAppointmentDeadline(c.id, a.title, a.date)}
              >
                Add to deadlines
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if c.uscis && c.uscis.notices.length > 0}
    <section class="panel" aria-labelledby="notices-title">
      <h2 id="notices-title" class="t-title">Notices</h2>
      <ul class="notices" role="list">
        {#each c.uscis.notices as n, i (n.letterId ?? i)}
          <li>
            <span class="t-body">{n.actionType ?? 'Notice'}</span>
            <span class="t-small muted">
              {#if n.generationDate}Generated {formatDateTime(n.generationDate, zone)}.{/if}
              {#if n.appointmentDateTime}Appointment {formatDateTime(
                  n.appointmentDateTime,
                  zone,
                )}.{/if}
              {#if n.letterId}Letter <span class="t-mono">{n.letterId}</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="panel" aria-labelledby="sit-title">
    <h2 id="sit-title" class="t-title">Where you sit</h2>
    <div class="sit">
      <TextField
        label="Published processing time, months"
        bind:value={months}
        inputmode="decimal"
        onchange={saveMonths}
        onblur={saveMonths}
        error={monthsError}
      />
      {#if wait}
        <p>
          Day {wait.elapsed} of {wait.total}.
          {wait.remaining >= 0
            ? `${plural(wait.remaining, 'day')} until the published time.`
            : `${plural(-wait.remaining, 'day')} past the published time.`}
        </p>
      {:else}
        <p class="muted">
          Enter the processing time for your form and office to compare it with your wait.
        </p>
      {/if}
      {#if published.length > 0}
        <div class="published">
          <p class="t-small muted">Published times for {c.form} from egov.uscis.gov:</p>
          <div class="chips">
            {#each published.slice(0, 6) as t (`${t.office}|${t.subtype}`)}
              <Button
                variant="outlined"
                onclick={() => t.months !== null && useMonths(t.months)}
                aria-label="Use {t.months} months, {t.office}{t.label ? `, ${t.label}` : ''}"
              >
                {t.months} mo, {t.office}{t.label ? `, ${t.label}` : ''}
              </Button>
            {/each}
          </div>
        </div>
      {/if}
      <a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noopener noreferrer">
        Check processing times on egov.uscis.gov
      </a>
    </div>
  </section>

  <section class="panel" aria-labelledby="timeline-title">
    <h2 id="timeline-title" class="t-title">Timeline</h2>
    {#if items.length === 0}
      <p class="muted">No entries. Log a status or sync with USCIS.</p>
    {:else}
      <ol class="timeline" role="list">
        {#each items as item (item.key)}
          <li class:fresh={item.kind === 'uscis' && item.isNew}>
            {#if item.kind === 'uscis'}
              <div class="t-main">
                <span class="t-body">{item.info.label}</span>
                {#if item.isNew}<Pill label="New" tone="new" />{/if}
              </div>
              <span class="t-small muted">
                {formatDateTime(item.at, zone)}. Day {item.day}.
                <span class="t-mono">{item.code}</span>,
                {CATEGORY_LABELS[item.info.category].toLowerCase()}.
              </span>
            {:else}
              <div class="t-main">
                <span class="t-body">{STATUSES[item.status].label}</span>
                <IconButton
                  icon="delete"
                  label="Delete entry: {STATUSES[item.status].label}"
                  onclick={() => deleteManualEntry(c.id, item.id)}
                />
              </div>
              <span class="t-small muted"
                >{formatDate(item.date)}. Day {item.day}. Added by you.</span
              >
              {#if item.note}<p class="t-small">{item.note}</p>{/if}
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section class="panel" aria-labelledby="case-deadlines-title">
    <div class="panel-head">
      <h2 id="case-deadlines-title" class="t-title">Deadlines</h2>
      <Button
        variant="text"
        icon="add"
        onclick={() => openSheet({ kind: 'deadline', caseId: c.id })}>New deadline</Button
      >
    </div>
    {#if deadlines.length === 0}
      <p class="muted t-small">No deadlines for this case.</p>
    {:else}
      <DeadlineList {deadlines} {today} showCase={false} />
    {/if}
    {#if openDeadlines.length > 0}
      <div>
        <Button
          variant="outlined"
          icon="calendar_add_on"
          onclick={() => exportDeadlinesToCalendar(openDeadlines, `waymark-${c.receipt}.ics`)}
        >
          Add to calendar
        </Button>
      </div>
    {/if}
  </section>

  <section class="panel" aria-labelledby="notes-title">
    <h2 id="notes-title" class="t-title">Notes</h2>
    <TextArea label="Notes for this case" bind:value={notes} rows={4} oninput={onNotes} />
    <p class="t-small muted" aria-live="polite">
      {notesState === 'pending'
        ? 'Saving'
        : notesState === 'saved'
          ? 'Saved on this device'
          : 'Notes save as you type.'}
    </p>
  </section>

  <div class="toolbar-space" aria-hidden="true"></div>
  <FloatingToolbar
    fixed
    label="Case actions"
    items={[
      {
        icon: 'edit',
        label: 'Edit case',
        onclick: () => openSheet({ kind: 'case', caseId: c.id }),
      },
      {
        icon: 'event',
        label: 'Add deadline',
        onclick: () => openSheet({ kind: 'deadline', caseId: c.id }),
      },
      {
        icon: 'content_copy',
        label: 'Copy summary',
        onclick: () => copyText(caseSummaryLine(c, today, zone), 'Copied the case summary.'),
      },
      { icon: 'delete', label: 'Delete case', onclick: remove },
    ]}
  />
{/if}

<style>
  .hero {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border-radius: var(--shape-2xl) var(--shape-l) var(--shape-2xl) var(--shape-l);
    background: var(--tone-container);
    color: var(--tone-on-container);
  }
  .hero-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .receipt-row {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: -2px;
  }
  .receipt-row :global(.icon-btn) {
    color: inherit;
  }
  .appointments {
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
  .appointment {
    gap: 4px;
  }
  .appointments .notices li {
    border-color: color-mix(in srgb, currentColor 20%, transparent);
  }
  .published {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hero-id {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .counter {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .hero :global(.pill) {
    background: var(--surface);
    color: var(--on-surface);
  }
  .hero :global(.wavy .track) {
    stroke: color-mix(in srgb, var(--tone-on-container) 20%, transparent);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0 0;
  }
  .stats div {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    padding: 16px;
    border-radius: var(--shape-l);
    background: var(--surface-container);
  }
  .stats dt {
    color: var(--on-surface-variant);
  }
  .stats dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 640;
    font-stretch: 90%;
  }
  .pair {
    display: grid;
    gap: 0 12px;
  }
  @media (min-width: 720px) {
    .pair {
      grid-template-columns: 1fr 1fr;
    }
  }
  .meaning {
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .notices,
  .timeline {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
  }
  .notices li {
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    border-top: 1px solid var(--outline-variant);
  }
  .notices li:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .timeline li {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0 10px 20px;
    border-left: 2px solid var(--outline-variant);
  }
  .timeline li::before {
    content: '';
    position: absolute;
    left: -7px;
    top: 16px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface-container-low);
  }
  .timeline li.fresh::before {
    background: var(--tertiary);
  }
  .t-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
  }
  .sit {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 480px;
  }
  .toolbar-space {
    height: 88px;
  }
</style>
