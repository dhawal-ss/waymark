<script lang="ts">
  import {
    activityBreakdown,
    caseJourney,
    eventsPerMonth,
    silentSinceLastNotice,
    type Case,
    type LocalDate,
    type Tone,
  } from '@waymark/core';
  import { plural } from '../../lib/format';
  import { openSheet } from '../../lib/stores/ui.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import JourneyBar from './JourneyBar.svelte';
  import MonthlyEvents from './MonthlyEvents.svelte';
  import SignalSplit from './SignalSplit.svelte';

  interface Props {
    c: Case;
    today: LocalDate;
    zone: string | undefined;
    /** Tone of the current status. */
    tone: Tone;
  }

  let { c, today, zone, tone }: Props = $props();

  const runs = $derived(caseJourney(c, today, zone));
  const breakdown = $derived(activityBreakdown(c, zone));
  const since = $derived(silentSinceLastNotice(c, zone));
  const months = $derived(eventsPerMonth(c, zone));
  const hasEvents = $derived(breakdown.total > 0);
</script>

<section class="panel" aria-labelledby="activity-title">
  <h2 id="activity-title" class="t-title">Case activity</h2>

  {#if !hasEvents && runs.length === 0}
    <p class="muted">
      No USCIS events yet. Import the case page from USCIS to see the stages your case passed
      through and which events are notices or background updates.
    </p>
    <div>
      <Button
        variant="tonal"
        icon="content_paste"
        onclick={() => openSheet({ kind: 'import', caseId: c.id })}>Import USCIS events</Button
      >
    </div>
  {:else}
    <p class="t-small muted">
      {#if hasEvents}
        Built from the {plural(breakdown.total, 'event')} USCIS recorded{c.manual.length > 0
          ? ' and the statuses you logged'
          : ''}. Event meanings are community documented, not official.
      {:else}
        Built from the statuses you logged.
      {/if}
    </p>

    <div class="block">
      <h3 class="t-label">Journey by stage</h3>
      {#if runs.length > 0}
        <JourneyBar {runs} />
        {#if runs.length === 1}
          <p class="t-small muted">Only one stage so far.</p>
        {/if}
      {:else}
        <p class="muted">
          The journey needs events that Waymark recognizes. The events on this case are not in the
          community dictionary.
        </p>
      {/if}
    </div>

    {#if hasEvents}
      <div class="block">
        <SignalSplit {breakdown} {since} {tone} />
      </div>
      <div class="block">
        <MonthlyEvents {months} />
      </div>
    {:else}
      <div class="block">
        <p class="muted">
          Notices, background updates, and events per month come from USCIS events. Import the case
          page from USCIS to see them.
        </p>
        <div>
          <Button
            variant="tonal"
            icon="content_paste"
            onclick={() => openSheet({ kind: 'import', caseId: c.id })}>Import USCIS events</Button
          >
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding-top: 16px;
    border-top: 1px solid var(--outline-variant);
  }
</style>
