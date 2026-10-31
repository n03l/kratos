<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { open = $bindable(false), title, children }: { open: boolean; title: string; children: Snippet } = $props();
  let dlg: HTMLDialogElement;

  $effect(() => {
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  });
</script>

<!-- Bottom sheet built on <dialog>: focus trapping, Escape and inert background come for free. -->
<dialog bind:this={dlg} onclose={() => (open = false)} onclick={(e) => e.target === dlg && (open = false)} aria-label={title}>
  <div class="sheet">
    <div class="grip" aria-hidden="true"></div>
    <header class="spread">
      <h2 class="h2">{title}</h2>
      <button class="icon-btn" onclick={() => (open = false)} aria-label="Close"><Icon name="close" /></button>
    </header>
    {#if open}{@render children()}{/if}
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    max-width: 560px;
    max-height: 88dvh;
    margin: 0 auto;
    padding: 0;
    border: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    background: var(--iron-1);
    color: var(--chalk);
    box-shadow: 0 -1px 0 var(--line);
  }
  dialog[open] { animation: rise 180ms ease-out; }
  dialog::backdrop { background: rgb(5 6 8 / 0.65); }
  .sheet { padding: 8px 16px calc(20px + var(--safe-b)); }
  .grip { width: 36px; height: 4px; margin: 0 auto 8px; border-radius: 2px; background: var(--iron-3); }
  header { margin-bottom: 12px; }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } }
  @media (min-width: 900px) {
    dialog { inset: 0; margin: auto; border-radius: var(--r-lg); height: fit-content; }
  }
</style>
