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
  import { onDestroy, tick } from 'svelte';
  import { addCase, deleteCase, todayLocal, updateCase } from '../actions';
  import { autoChecks, lookupReceipt, serverSync, trackNewCases } from '../serverSync.svelte';
  import { store } from '../stores/data.svelte';
  import { casePath, navigate } from '../stores/router.svelte';
  import { showSnackbar } from '../stores/snackbar.svelte';
  import { openSheet } from '../stores/ui.svelte';
  import { importFrom, importFromClipboard, isWaitingForReceipt, startSync } from '../sync.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import LoadingIndicator from '../ui/LoadingIndicator.svelte';
  import Select from '../ui/Select.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TextArea from '../ui/TextArea.svelte';
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
  // Empty for a new case, so a typed case never saves a guessed form or date.
  let form = $state<FormType | ''>(initial?.form ?? '');
  let owner = $state(initial?.owner ?? '');
  let receivedDate = $state(initial?.receivedDate ?? '');
  let status = $state<StatusKey>('received');
  let months = $state(initial?.processingMonths ? String(initial.processingMonths) : '');
  let submitted = $state(false);

  // A new case starts with the receipt number only. Waymark then gets the rest from USCIS: through
  // automatic checks when they are on, else from the case page the user copies. Typing the
  // details is the last resort.
  type Step = 'receipt' | 'checking' | 'uscis' | 'details';
  let step = $state<Step>(initial ? 'details' : 'receipt');
  let lookupError = $state('');
  let pasted = $state('');
  let pasteError = $state('');
  // The receipt being added, kept apart from the field: once the case exists it is a duplicate.
  let number = $state('');
  // Closing the sheet during a check cancels what would follow it.
  let mounted = true;
  onDestroy(() => (mounted = false));

  const others = $derived(store.data.cases.filter((c) => c.id !== caseId).map((c) => c.receipt));
  const receiptCheck = $derived(checkReceipt(receipt, others));
  const hint = $derived(prefixHint(receipt));
  const receiptHelp = $derived(
    autoChecks()
      ? `${hint ?? '3 letters and 10 digits.'} Waymark gets the form, dates, and status from USCIS.`
      : (hint ?? '3 letters and 10 digits, from the receipt notice.'),
  );
  const formError = $derived(form === '' ? 'Choose the form from the receipt notice.' : undefined);
  const notFound = $derived(/no case with this receipt/i.test(lookupError));
  const lookupNote = $derived(
    !lookupError
      ? ''
      : notFound && serverSync.environment === 'sandbox'
        ? 'Automatic checks could not find this case. This server uses the USCIS test system, so real cases are not found yet. Get the details from your USCIS account instead.'
        : notFound
          ? 'Automatic checks could not find this case. Check the receipt number, or get the details from your USCIS account.'
          : `Automatic checks did not return this case. ${lookupError}`,
  );
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
  const valid = $derived(receiptCheck.ok && !dateError && !monthsError && !formError);
  const looksLikeJson = (text: string) => text.trimStart().startsWith('{');
  // Pasting the case page into the receipt field imports it right away.
  const receiptError = $derived(
    looksLikeJson(receipt)
      ? pasteError
      : (submitted || receipt.length >= 13) && !receiptCheck.ok
        ? receiptCheck.error
        : undefined,
  );

  function importText(text: string): void {
    const result = importFrom(text);
    if (!result.ok) {
      pasteError = result.message;
      return;
    }
    pasteError = '';
    onclose();
  }

  function onReceiptInput() {
    if (looksLikeJson(receipt)) importText(receipt);
    else pasteError = '';
  }

  function onPasteInput() {
    if (looksLikeJson(pasted)) importText(pasted);
    else pasteError = pasted.trim() ? 'This is not the case page. Copy the whole page again.' : '';
  }

  async function findCase(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (looksLikeJson(receipt)) return importText(receipt);
    if (!receiptCheck.ok) {
      void tick().then(() =>
        document.querySelector<HTMLElement>('#case-form [aria-invalid="true"]')?.focus(),
      );
      return;
    }
    number = receiptCheck.receipt;
    receipt = number;
    await check();
  }

  async function check() {
    lookupError = '';
    if (autoChecks()) {
      step = 'checking';
      void tick().then(() => document.getElementById('case-checking')?.focus());
      const added = number;
      const result = await lookupReceipt(added);
      if (!mounted) {
        // The user closed the sheet while USCIS answered: keep the case, but stay where they are.
        if (result.ok)
          showSnackbar(`Added case ${added}.`, {
            label: 'Open',
            run: () => navigate(casePath(result.caseId).slice(1)),
          });
        return;
      }
      if (result.ok) {
        onclose();
        navigate(casePath(result.caseId).slice(1));
        showSnackbar(`Added case ${added}.`);
        return;
      }
      lookupError = result.message;
    }
    step = 'uscis';
    submitted = false;
    // The Add case button is gone; start keyboard and screen reader users on the next action.
    void tick().then(() => document.querySelector<HTMLElement>('#case-uscis button')?.focus());
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (!valid || !receiptCheck.ok || form === '') {
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
      trackNewCases();
      navigate(casePath(c.id).slice(1));
    }
  }
</script>

<Sheet open title={existing ? 'Edit case' : 'Add case'} {onclose}>
  {#if step === 'receipt'}
    <form id="case-form" class="form" novalidate onsubmit={findCase}>
      <TextField
        label="Receipt number"
        bind:value={receipt}
        oninput={onReceiptInput}
        data-autofocus
        enterkeyhint="go"
        mono
        autocomplete="off"
        autocapitalize="characters"
        spellcheck={false}
        required
        supporting={receiptHelp}
        error={receiptError}
      />
      <div>
        <Button variant="text" icon="upload_file" onclick={() => openSheet({ kind: 'import' })}
          >Import a saved case file</Button
        >
      </div>
    </form>
  {:else if step === 'checking'}
    <div class="checking" id="case-checking" tabindex="-1">
      <LoadingIndicator label="Checking with USCIS" size={40} />
      <p>Checking <span class="t-mono">{number}</span> with USCIS.</p>
    </div>
  {:else if step === 'uscis'}
    <div class="uscis" id="case-uscis">
      {#if lookupNote}
        <p class="note t-small" role="status">
          <Icon name="info" size={18} />
          <span>{lookupNote}</span>
        </p>
      {/if}
      <p>
        Get the details for <span class="t-mono">{number}</span> from your USCIS account.
      </p>
      <ol class="steps">
        <li>Open the case page. Sign in to USCIS if asked.</li>
        <li>Select all and copy the page, then come back here. Waymark imports it for you.</li>
      </ol>
      <div class="row">
        {#if isWaitingForReceipt(number)}
          <Button icon="content_paste" onclick={() => importFromClipboard()}
            >Import copied page</Button
          >
        {/if}
        <Button
          variant={isWaitingForReceipt(number) ? 'outlined' : 'filled'}
          icon="open_in_new"
          onclick={() => startSync(number)}>Open case page</Button
        >
        {#if lookupError && !notFound && autoChecks()}
          <Button variant="outlined" icon="sync" onclick={check}>Check again</Button>
        {/if}
      </div>
      <TextArea
        label="Or paste the copied page here"
        bind:value={pasted}
        oninput={onPasteInput}
        mono
        rows={3}
        spellcheck={false}
        autocomplete="off"
        error={pasteError || undefined}
      />
      <div>
        <Button
          variant="text"
          icon="edit"
          onclick={() => {
            step = 'details';
            void tick().then(() =>
              document.querySelector<HTMLElement>('#case-form input[type="date"]')?.focus(),
            );
          }}>Enter details yourself</Button
        >
      </div>
    </div>
  {:else}
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
        error={submitted ? formError : undefined}
        options={[
          ...(existing ? [] : [{ value: '' as const, label: 'Choose a form' }]),
          ...FORM_TYPES.map((f) => ({
            value: f,
            label: f === 'Other' ? 'Other' : `${f}, ${FORM_NAMES[f]}`,
          })),
        ]}
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
  {/if}
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
    {#if step === 'receipt' || step === 'details'}
      <Button type="submit" form="case-form">{existing ? 'Save changes' : 'Add case'}</Button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .form,
  .uscis {
    display: grid;
    gap: 16px;
  }
  .uscis p {
    margin: 0;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
    color: var(--on-surface-variant);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .checking {
    outline: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 0;
    text-align: center;
  }
  .note {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-radius: var(--shape-m);
    background: var(--surface-container-highest);
    color: var(--on-surface);
  }
  /* Kept apart from Save so it is not tapped by mistake. */
  :global(.btn.delete) {
    margin-inline-end: auto;
    color: var(--error);
  }
</style>
