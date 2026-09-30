<script lang="ts">
  import { formatMoney } from '../../lib/format';
  import { mutate, newId, store } from '../../lib/stores/data.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import TextField from '../../lib/ui/TextField.svelte';

  let label = $state('');
  let amount = $state('');
  let submitted = $state(false);

  const total = $derived(store.data.fees.reduce((s, f) => s + f.cents, 0));
  const cents = $derived(Math.round(Number(amount.replace(/[$,\s]/g, '')) * 100));
  const labelError = $derived(
    label.trim() ? undefined : 'Enter what the fee is for, for example "I-485 filing".',
  );
  const amountError = $derived(
    amount.trim() && Number.isFinite(cents) && cents >= 0 && cents < 10_000_000
      ? undefined
      : 'Enter the amount in dollars using digits, like 1234.56.',
  );

  function add(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (labelError || amountError) return;
    mutate((d) => d.fees.push({ id: newId(), label: label.trim(), cents }));
    label = '';
    amount = '';
    submitted = false;
  }

  function remove(id: string, name: string) {
    mutate((d) => (d.fees = d.fees.filter((f) => f.id !== id)), { undo: `Deleted fee: ${name}.` });
  }
</script>

<section class="panel" aria-labelledby="fees-title">
  <h2 id="fees-title" class="t-headline">Fee tally</h2>
  <p class="muted t-small">
    Waymark does not include fees because they change. Enter amounts from the
    <a href="https://www.uscis.gov/g-1055" target="_blank" rel="noopener noreferrer"
      >G-1055 fee schedule</a
    >.
  </p>
  {#if store.data.fees.length > 0}
    <ul class="fees" role="list">
      {#each store.data.fees as f (f.id)}
        <li>
          <span>{f.label}</span>
          <span class="amount">{formatMoney(f.cents)}</span>
          <IconButton
            icon="delete"
            label="Delete fee: {f.label}"
            onclick={() => remove(f.id, f.label)}
          />
        </li>
      {/each}
    </ul>
    <p class="total">
      <span class="t-title">Total</span>
      <span class="t-title-large amount">{formatMoney(total)}</span>
    </p>
  {:else}
    <p class="muted">No fees entered.</p>
  {/if}
  <form class="add" novalidate onsubmit={add}>
    <TextField label="Fee for" bind:value={label} error={submitted ? labelError : undefined} />
    <TextField
      label="Amount, USD"
      bind:value={amount}
      inputmode="decimal"
      error={submitted ? amountError : undefined}
    />
    <div><Button type="submit" variant="tonal" icon="add">Add fee</Button></div>
  </form>
</section>

<style>
  .fees {
    margin: 0;
    padding: 0;
  }
  .fees li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--outline-variant);
  }
  .amount {
    font-variant-numeric: tabular-nums;
  }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .add {
    display: grid;
    gap: 12px;
  }
  @media (min-width: 720px) {
    .add {
      grid-template-columns: 2fr 1fr auto;
      align-items: start;
    }
    .add div {
      padding-top: 8px;
    }
  }
</style>
