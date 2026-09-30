<script lang="ts">
  import { install, promptInstall } from '../install.svelte';
  import { showSnackbar } from '../stores/snackbar.svelte';
  import Button from './Button.svelte';

  async function run() {
    const accepted = await promptInstall();
    if (accepted) showSnackbar('Installing Waymark. It will appear on your home screen.');
  }
</script>

<section class="group" aria-labelledby="install-title">
  <h2 id="install-title" class="t-title">Install on this phone</h2>
  {#if install.installed}
    <p>Waymark is installed and runs from your home screen, offline too.</p>
    <p class="t-small muted">
      To import case JSON without pasting, copy it on my.uscis.gov, then share it to Waymark from
      the browser's share menu.
    </p>
  {:else if install.available}
    <p>
      Install Waymark to open it from your home screen, use it offline, and share case JSON into it.
    </p>
    <div><Button icon="mobile_arrow_down" onclick={run}>Install Waymark</Button></div>
  {:else}
    <p>
      To install, open the browser menu and choose Add to Home screen or Install app. Waymark then
      works offline and can receive shared case JSON.
    </p>
  {/if}
</section>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
  }
</style>
