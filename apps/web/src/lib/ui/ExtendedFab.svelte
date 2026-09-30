<script lang="ts">
  import { reserveFloatingSpace } from './floating';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props {
    /** Visible label; it names the action, for example "Add case". */
    label: string;
    icon: IconName;
    onclick: () => void;
  }

  let { label, icon, onclick }: Props = $props();

  $effect(() => reserveFloatingSpace());
</script>

<button type="button" class="efab" {onclick}>
  <Icon name={icon} size={24} />
  <span>{label}</span>
</button>

<style>
  .efab {
    position: fixed;
    z-index: 31;
    right: max(16px, env(safe-area-inset-right));
    bottom: calc(var(--nav-bar-height) + 16px + env(safe-area-inset-bottom));
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 20px 0 16px;
    border: 0;
    border-radius: var(--shape-l);
    background: var(--primary-container);
    color: var(--on-primary-container);
    font: inherit;
    font-size: 1rem;
    font-weight: 560;
    box-shadow: var(--elevation-3);
    cursor: pointer;
    transform: translateY(calc(-1 * var(--snackbar-offset, 0px)));
    transition:
      transform var(--spring-default-spatial-duration) var(--spring-default-spatial),
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  .efab::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    .efab:hover::after {
      opacity: var(--state-hover);
    }
  }
  .efab:active {
    border-radius: var(--shape-xl);
  }
  @media (min-width: 840px) {
    .efab {
      bottom: 24px;
      right: 24px;
    }
  }
</style>
