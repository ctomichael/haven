<script lang="ts">
  import { Plus } from 'lucide-svelte';

  let { onclick, sub = 'Hold to speak · tap to type' }: { onclick?: () => void; sub?: string } =
    $props();
</script>

<button class="capture" type="button" {onclick}>
  <span class="icon-box"><Plus size={36} strokeWidth={2.5} /></span>
  <span class="text">
    <span class="title">Note</span>
    <span class="sub">{sub}</span>
  </span>
</button>

<style>
  .capture {
    display: flex;
    align-items: center;
    gap: 20px;
    border: var(--border-thick) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    padding: 20px 28px;
    width: 100%;
    height: 100%;
    text-align: left;
  }
  .icon-box {
    width: 56px;
    height: 56px;
    border: var(--border-normal) solid var(--ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 42px;
    line-height: 1;
    color: var(--ink);
  }
  .sub {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted-mono);
  }
</style>
