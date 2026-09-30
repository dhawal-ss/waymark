<script lang="ts">
  import { CHECKLISTS } from '../../lib/checklists';
  import { mutate, store } from '../../lib/stores/data.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import Checkbox from '../../lib/ui/Checkbox.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import WavyProgress from '../../lib/ui/WavyProgress.svelte';

  const forms = new Set(store.data.cases.map((c) => c.form as string));
  let selected = $state(CHECKLISTS.find((l) => forms.has(l.form))?.id ?? 'i485');
  const list = $derived(CHECKLISTS.find((l) => l.id === selected) ?? CHECKLISTS[0]!);
  const checked = $derived(store.data.checklists[list.id] ?? []);
  const done = $derived(list.items.filter((i) => checked.includes(i.id)).length);

  function toggle(itemId: string, on: boolean) {
    mutate((d) => {
      const current = d.checklists[list.id] ?? [];
      d.checklists[list.id] = on
        ? [...new Set([...current, itemId])]
        : current.filter((x) => x !== itemId);
    });
  }

  function clear() {
    mutate((d) => (d.checklists[list.id] = []), { undo: `Cleared the ${list.form} checklist.` });
  }
</script>

<section class="panel" aria-labelledby="check-title">
  <h2 id="check-title" class="t-headline">Document checklists</h2>
  <p class="muted t-small">
    A starting point, not official instructions. Check the form instructions on uscis.gov before you
    file.
  </p>
  <div class="select">
    <Select
      label="Form"
      bind:value={selected}
      options={CHECKLISTS.map((l) => ({ value: l.id, label: l.form }))}
    />
  </div>
  <p class="t-label" id="progress-label">{done} of {list.items.length} ready</p>
  <WavyProgress
    value={done}
    max={list.items.length}
    label="{list.form} checklist progress"
    valueText="{done} of {list.items.length} ready"
  />
  <div class="items">
    {#each list.items as item (item.id)}
      <Checkbox
        label={item.text}
        checked={checked.includes(item.id)}
        onchange={(on) => toggle(item.id, on)}
      />
    {/each}
  </div>
  {#if done > 0}<div><Button variant="text" onclick={clear}>Clear checks</Button></div>{/if}
</section>

<style>
  .select {
    max-width: 240px;
  }
  .items {
    display: flex;
    flex-direction: column;
  }
</style>
