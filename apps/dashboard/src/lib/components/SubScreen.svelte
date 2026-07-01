<script lang="ts">
  import type { Snippet } from 'svelte';
  import BackToDashboard from './BackToDashboard.svelte';
  import StatusBar from './StatusBar.svelte';
  import { dummy } from '$lib/dummy';

  /**
   * Shared chrome for sub-screens. Same 36 px padding, back control top-left,
   * h1 + optional meta in the masthead, status bar pinned to bottom.
   * Content fills the middle; full-refresh navigation (no transition).
   */
  let {
    title,
    meta,
    children,
  }: { title: string; meta?: string; children: Snippet } = $props();
</script>

<main class="screen">
  <header class="bar">
    <BackToDashboard />
    {#if meta}<span class="meta">{meta}</span>{/if}
  </header>

  <header class="masthead">
    <h1>{title}</h1>
  </header>

  <section class="content">
    {@render children()}
  </section>

  <StatusBar
    online={dummy.status.online}
    lastSync={dummy.status.lastSync}
    hermesReady={dummy.status.hermesReady}
    identities={dummy.status.identities}
  />
</main>

<style>
  .screen {
    width: 100vw;
    min-height: 100vh;
    background: var(--paper);
    padding: 36px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    box-sizing: border-box;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    color: var(--ink);
    text-transform: uppercase;
  }
  .masthead {
    border-bottom: var(--border-normal) solid var(--ink);
    padding-bottom: 16px;
  }
  h1 {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 60px;
    line-height: 1.05;
    margin: 0;
  }
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
