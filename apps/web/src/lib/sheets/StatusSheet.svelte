<script lang="ts">
  import { isLocalDate, STATUS_KEYS, STATUSES, type StatusKey } from '@waymark/core';
  import { untrack } from 'svelte';
  import { logStatus, todayLocal } from '../actions';
  import Button from '../ui/Button.svelte';
  import Select from '../ui/Select.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TextArea from '../ui/TextArea.svelte';
  import TextField from '../ui/TextField.svelte';

  interface Props {
    caseId: string;
    status?: StatusKey;
    onclose: () => void;
  }

  let { caseId, status: initialStatus, onclose }: Props = $props();

  const today = todayLocal();
  let status = $state<StatusKey>(untrack(() => initialStatus) ?? 'review');
  let date = $state(today);
  let note = $state('');
  let submitted = $state(false);
  // Evidence requests and intents to deny come with a response due date worth tracking.
  const RESPONSE_TITLES: Partial<Record<StatusKey, string>> = {
    rfe: 'Respond to the evidence request',
    noid: 'Respond to the intent to deny',
  };
  const responseTitle = $derived(RESPONSE_TITLES[status]);
  let due = $state('');
  const dueError = $derived(
    due && (!isLocalDate(due) || due < today) ? 'Enter a due date from today on.' : undefined,
  );

  const dateError = $derived(
    !isLocalDate(date)
      ? 'Enter the date of the update.'
      : date > today
        ? 'The date cannot be in the future. Use a deadline for upcoming dates.'
        : undefined,
  );

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (dateError || (responseTitle && dueError)) return;
    logStatus(
      caseId,
      status,
      date,
      note,
      responseTitle && due ? { title: responseTitle, date: due } : undefined,
    );
    onclose();
  }
</script>

<Sheet open title="Log a status" {onclose}>
  <form id="status-form" class="form" novalidate onsubmit={submit}>
    <Select
      label="Status"
      bind:value={status}
      options={STATUS_KEYS.map((k) => ({ value: k, label: STATUSES[k].label }))}
    />
    <TextField
      label="Date"
      type="date"
      bind:value={date}
      max={today}
      required
      error={submitted || date > today ? dateError : undefined}
    />
    {#if responseTitle}
      <TextField
        label="Response due"
        type="date"
        bind:value={due}
        min={today}
        error={submitted ? dueError : undefined}
        supporting="Optional. Adds a deadline: {responseTitle}."
      />
    {/if}
    <TextArea label="Note" bind:value={note} rows={3} supporting="Optional." />
  </form>
  {#snippet actions()}
    <Button variant="text" onclick={onclose}>Cancel</Button>
    <Button type="submit" form="status-form">Log status</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: grid;
    gap: 16px;
  }
</style>
