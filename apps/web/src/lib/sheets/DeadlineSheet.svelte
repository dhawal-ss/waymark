<script lang="ts">
  import { isLocalDate, toEpochDay, fromEpochDay } from '@waymark/core';
  import { untrack } from 'svelte';
  import { addDeadline, exportDeadlinesToCalendar, todayLocal, updateDeadline } from '../actions';
  import { store } from '../stores/data.svelte';
  import { showSnackbar } from '../stores/snackbar.svelte';
  import Button from '../ui/Button.svelte';
  import Select from '../ui/Select.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TextField from '../ui/TextField.svelte';

  interface Props {
    caseId?: string;
    deadlineId?: string;
    onclose: () => void;
  }

  let { caseId, deadlineId, onclose }: Props = $props();

  const initial = store.data.deadlines.find((d) => d.id === deadlineId);
  let title = $state(initial?.title ?? '');
  let date = $state(initial?.date ?? todayLocal());
  let linked = $state(initial?.caseId ?? untrack(() => caseId) ?? '');
  let submitted = $state(false);

  const titleError = $derived(
    title.trim() ? undefined : 'Enter what is due, for example "Respond to evidence request".',
  );
  const dateError = $derived(isLocalDate(date) ? undefined : 'Enter the due date.');
  const caseOptions = $derived([
    { value: '', label: 'No case' },
    ...store.data.cases.map((c) => ({
      value: c.id,
      label: `${c.form} ${c.receipt}${c.owner ? `, ${c.owner}` : ''}`,
    })),
  ]);

  // Google Calendar on Android does not open .ics files, so offer its add-event page too. Only
  // the title and date go to Google, and only when the user taps the link.
  const googleUrl = $derived.by(() => {
    if (!initial || !isLocalDate(date) || !title.trim()) return '';
    const day = (d: string) => d.replace(/-/g, '');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title.trim(),
      dates: `${day(date)}/${day(fromEpochDay(toEpochDay(date) + 1))}`,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (titleError || dateError) return;
    if (initial) {
      updateDeadline(initial.id, { title: title.trim(), date, caseId: linked || undefined });
      showSnackbar('Saved the deadline.');
    } else {
      addDeadline({ title, date, caseId: linked || undefined });
    }
    onclose();
  }
</script>

<Sheet open title={initial ? 'Edit deadline' : 'New deadline'} {onclose}>
  <form id="deadline-form" class="form" novalidate onsubmit={submit}>
    <TextField
      label="What is due"
      bind:value={title}
      required
      error={submitted ? titleError : undefined}
    />
    <TextField
      label="Due date"
      type="date"
      bind:value={date}
      required
      error={submitted ? dateError : undefined}
    />
    <Select label="Case" bind:value={linked} options={caseOptions} />
  </form>
  {#if initial}
    <section class="calendar" aria-labelledby="calendar-title">
      <h3 id="calendar-title" class="t-label">Add to a calendar</h3>
      <div class="calendar-actions">
        <Button
          variant="outlined"
          icon="calendar_add_on"
          onclick={() =>
            exportDeadlinesToCalendar(
              [{ ...initial, title: title.trim() || initial.title, date }],
              'waymark-deadline.ics',
            )}>Download .ics file</Button
        >
        {#if googleUrl}
          <Button variant="text" href={googleUrl} target="_blank" rel="noopener noreferrer"
            >Open in Google Calendar</Button
          >
        {/if}
      </div>
      <p class="t-small muted">
        Google Calendar opens with the title and date filled in. Nothing else is sent.
      </p>
    </section>
  {/if}
  {#snippet actions()}
    <Button variant="text" onclick={onclose}>Cancel</Button>
    <Button type="submit" form="deadline-form">{initial ? 'Save deadline' : 'Add deadline'}</Button>
  {/snippet}
</Sheet>

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
  }
  .calendar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .form {
    display: grid;
    gap: 16px;
  }
</style>
