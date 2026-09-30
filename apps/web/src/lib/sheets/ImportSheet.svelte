<script lang="ts">
  import { isValidReceipt, normalizeReceipt } from '@waymark/core';
  import { untrack } from 'svelte';
  import { importUscis } from '../actions';
  import { store } from '../stores/data.svelte';
  import { caseJsonUrl } from '../sync.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TextArea from '../ui/TextArea.svelte';
  import TextField from '../ui/TextField.svelte';

  interface Props {
    caseId?: string;
    message?: string;
    /** Text shared to the app, shown for review before importing. */
    text?: string;
    onclose: () => void;
  }

  let { caseId, message, text: sharedText, onclose }: Props = $props();

  const target = $derived(caseId ? store.data.cases.find((c) => c.id === caseId) : undefined);
  let text = $state(untrack(() => sharedText) ?? '');
  const initialMessage = untrack(() => message);
  let problems = $state<string[]>(initialMessage ? [initialMessage] : []);
  let warning = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  const MAX_BYTES = 5 * 1024 * 1024;
  const shared = untrack(() => Boolean(sharedText?.trim()));
  // Without a case, a receipt number builds the link to its JSON.
  let receipt = $state('');
  const typedReceipt = $derived(normalizeReceipt(receipt));

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        problems = ['The clipboard is empty. Copy the whole case JSON page first.'];
        return;
      }
      text = clip;
      problems = [];
    } catch {
      problems = [
        'The browser did not allow reading the clipboard. Long-press the Case JSON field and choose Paste.',
      ];
    }
  }

  async function onFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      problems = [
        'The file is larger than 5 MB. Choose the case JSON file saved from my.uscis.gov.',
      ];
      return;
    }
    text = await file.text();
    run();
  }

  function run() {
    const result = importUscis(text);
    if (!result.ok) {
      problems = result.parse.problems.length > 0 ? result.parse.problems : [result.message];
      warning = '';
      return;
    }
    if (result.parse.problems.length > 0) {
      warning = result.parse.problems.join(' ');
      problems = [];
      text = '';
      return;
    }
    onclose();
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    run();
  }
</script>

<Sheet open title="Import USCIS case JSON" {onclose}>
  {#if shared}
    <p class="steps shared">
      Check the shared text, then choose Import JSON. Only case events, notices, and dates are kept.
    </p>
  {:else}
    <ol class="steps">
      <li>
        {#if target}
          Open <a href={caseJsonUrl(target.receipt)} target="_blank" rel="noopener noreferrer"
            >the case JSON for {target.receipt}</a
          >
        {:else if isValidReceipt(typedReceipt)}
          Open <a href={caseJsonUrl(typedReceipt)} target="_blank" rel="noopener noreferrer"
            >the case JSON for {typedReceipt}</a
          >
        {:else}
          Enter the receipt number below to get the link to its case JSON, or open
          <span class="t-mono">my.uscis.gov/account/case-service/api/cases/</span> followed by the receipt
          number
        {/if}
        while signed in to your USCIS account.
      </li>
      <li>Select all text on the page and copy it.</li>
      <li>Paste it below or upload a saved file. Only case events, notices, and dates are kept.</li>
    </ol>
    {#if !target}
      <div class="receipt">
        <TextField
          label="Receipt number"
          bind:value={receipt}
          autocomplete="off"
          spellcheck={false}
          autocapitalize="characters"
          supporting="Optional. Three letters and ten digits, for example IOE0123456789."
        />
      </div>
    {/if}
  {/if}

  {#if problems.length > 0}
    <div class="alert error" role="alert">
      <Icon name="error" size={20} />
      <ul role="list">
        {#each problems as p (p)}<li>{p}</li>{/each}
      </ul>
    </div>
  {/if}
  {#if warning}
    <div class="alert" role="status">
      <Icon name="info" size={20} />
      <p>Imported with problems: {warning}</p>
    </div>
  {/if}

  <form id="import-form" class="form" novalidate onsubmit={submit}>
    {#if !shared}
      <div>
        <Button variant="tonal" icon="content_paste" onclick={paste}>Paste copied JSON</Button>
      </div>
    {/if}
    <TextArea
      label="Case JSON"
      bind:value={text}
      mono
      rows={6}
      spellcheck={false}
      autocomplete="off"
    />
    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept=".json,.txt,application/json,text/plain"
      tabindex="-1"
      aria-hidden="true"
      onchange={onFile}
    />
  </form>
  {#snippet actions()}
    <Button variant="outlined" icon="upload_file" onclick={() => fileInput?.click()}
      >Upload file</Button
    >
    <Button type="submit" form="import-form" disabled={!text.trim()}>Import JSON</Button>
  {/snippet}
</Sheet>

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 16px;
    padding-left: 20px;
    color: var(--on-surface-variant);
  }
  .steps.shared {
    padding-left: 0;
  }
  .receipt {
    margin-bottom: 16px;
  }
  .steps .t-mono {
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }
  .form {
    display: grid;
    gap: 12px;
  }
  .alert {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--surface-container-highest);
    color: var(--on-surface);
  }
  .alert.error {
    background: var(--error-container);
    color: var(--on-error-container);
  }
  .alert ul {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
