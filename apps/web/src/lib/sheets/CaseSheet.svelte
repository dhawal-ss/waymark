<script lang="ts">
  import {
    checkReceipt,
    FORM_NAMES,
    FORM_TYPES,
    isLocalDate,
    prefixHint,
    STATUS_KEYS,
    STATUSES,
    type FormType,
    type StatusKey,
  } from '@waymark/core';
  import { tick } from 'svelte';
  import { addCase, deleteCase, todayLocal, updateCase } from '../actions';
  import { store } from '../stores/data.svelte';
  import { casePath, navigate } from '../stores/router.svelte';
  import Button from '../ui/Button.svelte';
  import Select from '../ui/Select.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TextField from '../ui/TextField.svelte';

  interface Props {
    caseId?: string;
    onclose: () => void;
  }

  let { caseId, onclose }: Props = $props();

  const existing = $derived(caseId ? store.data.cases.find((c) => c.id === caseId) : undefined);
  const today = todayLocal();

  // Seed the form once from the case being edited.
  const initial = store.data.cases.find((c) => c.id === caseId);
  let receipt = $state(initial?.receipt ?? '');
  let form = $state<FormType>(initial?.form ?? 'I-485');
  let owner = $state(initial?.owner ?? '');
  let receivedDate = $state(initial?.receivedDate ?? today);
  let status = $state<StatusKey>('received');
  let months = $state(initial?.processingMonths ? String(initial.processingMonths) : '');
  let submitted = $state(false);

  const others = $derived(store.data.cases.filter((c) => c.id !== caseId).map((c) => c.receipt));
  const receiptCheck = $derived(checkReceipt(receipt, others));
  const hint = $derived(prefixHint(receipt));
  const dateError = $derived(
    !isLocalDate(receivedDate)
      ? 'Enter the received date from the receipt notice.'
      : receivedDate > today
        ? 'The received date cannot be in the future. Check the receipt notice.'
        : undefined,
  );
  const monthsValue = $derived(months.trim() === '' ? undefined : Number(months));
  const monthsError = $derived(
    monthsValue !== undefined &&
      (!Number.isFinite(monthsValue) || monthsValue <= 0 || monthsValue > 120)
      ? 'Enter a number of months between 0.5 and 120, or leave it empty.'
      : undefined,
  );
  const valid = $derived(receiptCheck.ok && !dateError && !monthsError);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (!valid || !receiptCheck.ok) {
      // Take the user to the first field that needs fixing.
      void tick().then(() =>
        document.querySelector<HTMLElement>('#case-form [aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (existing) {
      updateCase(
        existing.id,
        {
          receipt: receiptCheck.receipt,
          form,
          owner: owner.trim(),
          receivedDate,
          processingMonths: monthsValue,
        },
        'Saved changes.',
      );
      onclose();
    } else {
      const c = addCase({
        receipt: receiptCheck.receipt,
        form,
        owner,
        receivedDate,
        status,
        processingMonths: monthsValue,
      });
      onclose();
      navigate(casePath(c.id).slice(1));
    }
  }
</script>

<Sheet open title={existing ? 'Edit case' : 'Add case'} {onclose}>
  <form id="case-form" class="form" novalidate onsubmit={submit}>
    <TextField
      label="Receipt number"
      bind:value={receipt}
      data-autofocus={existing ? undefined : true}
      enterkeyhint="next"
      mono
      autocomplete="off"
      autocapitalize="characters"
      spellcheck={false}
      required
      supporting={hint ?? '3 letters and 10 digits, from the receipt notice'}
      error={(submitted || receipt.length >= 13) && !receiptCheck.ok
        ? receiptCheck.error
        : undefined}
    />
    <Select
      label="Form"
      bind:value={form}
      options={FORM_TYPES.map((f) => ({
        value: f,
        label: f === 'Other' ? 'Other' : `${f}, ${FORM_NAMES[f]}`,
      }))}
    />
    <TextField
      label="Received date"
      type="date"
      bind:value={receivedDate}
      max={today}
      required
      error={submitted || receivedDate > today ? dateError : undefined}
    />
    <TextField
      label="Name"
      bind:value={owner}
      autocomplete="off"
      supporting="Whose case this is. Optional."
    />
    {#if !existing}
      <Select
        label="Current status"
        bind:value={status}
        options={STATUS_KEYS.map((k) => ({ value: k, label: STATUSES[k].label }))}
      />
    {/if}
    <TextField
      label="Published processing time, months"
      bind:value={months}
      inputmode="decimal"
      supporting="From egov.uscis.gov/processing-times. Optional."
      error={monthsError}
    />
  </form>
  {#snippet actions()}
    {#if existing}
      <Button
        variant="text"
        icon="delete"
        class="delete"
        onclick={() => {
          const id = existing.id;
          onclose();
          deleteCase(id);
          navigate('/cases');
        }}>Delete case</Button
      >
    {/if}
    <Button variant="text" onclick={onclose}>Cancel</Button>
    <Button type="submit" form="case-form">{existing ? 'Save changes' : 'Add case'}</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: grid;
    gap: 16px;
  }
  /* Kept apart from Save so it is not tapped by mistake. */
  :global(.btn.delete) {
    margin-inline-end: auto;
    color: var(--error);
  }
</style>
