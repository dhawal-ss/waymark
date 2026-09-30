<script lang="ts">
  import { isLocalDate } from '@waymark/core';
  import { untrack } from 'svelte';
  import { addDeadline, todayLocal, updateDeadline } from '../actions';
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
  {#snippet actions()}
    <Button variant="text" onclick={onclose}>Cancel</Button>
    <Button type="submit" form="deadline-form">{initial ? 'Save deadline' : 'Add deadline'}</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: grid;
    gap: 16px;
  }
</style>
