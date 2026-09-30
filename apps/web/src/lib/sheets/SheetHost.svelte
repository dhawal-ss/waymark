<script lang="ts">
  import { closeSheet, ui } from '../stores/ui.svelte';
  import CaseSheet from './CaseSheet.svelte';
  import DeadlineSheet from './DeadlineSheet.svelte';
  import ImportSheet from './ImportSheet.svelte';
  import StatusSheet from './StatusSheet.svelte';
</script>

{#if ui.sheet?.kind === 'case'}
  <CaseSheet caseId={ui.sheet.caseId} onclose={closeSheet} />
{:else if ui.sheet?.kind === 'deadline'}
  <DeadlineSheet caseId={ui.sheet.caseId} deadlineId={ui.sheet.deadlineId} onclose={closeSheet} />
{:else if ui.sheet?.kind === 'import'}
  {#key ui.sheet}
    <ImportSheet caseId={ui.sheet.caseId} message={ui.sheet.message} onclose={closeSheet} />
  {/key}
{:else if ui.sheet?.kind === 'status'}
  <StatusSheet caseId={ui.sheet.caseId} status={ui.sheet.status} onclose={closeSheet} />
{/if}
