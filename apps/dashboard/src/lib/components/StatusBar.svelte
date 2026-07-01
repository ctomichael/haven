<script lang="ts">
  import type { Identity } from '$lib/dummy';

  let {
    online,
    lastSync,
    hermesReady,
    identities,
  }: {
    online: boolean;
    lastSync: string;
    hermesReady: boolean;
    identities: Identity[];
  } = $props();
</script>

<footer class="status">
  <div class="left">
    <span class="dot" data-on={online} aria-hidden="true"></span>
    <span class="meta">{online ? 'ONLINE' : 'OFFLINE'}</span>
    <span class="meta">LAST SYNC {lastSync}</span>
    <span class="meta">{hermesReady ? 'HERMES READY' : 'HERMES IDLE'}</span>
  </div>
  <div class="right">
    {#each identities as id (id.initial)}
      <span class="badge" style="--solid: var(--accent-{id.accent});">{id.initial}</span>
    {/each}
  </div>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: var(--border-normal) solid var(--ink);
    padding-top: 16px;
    gap: 16px;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .dot {
    width: 10px;
    height: 10px;
    background: var(--ink);
    display: inline-block;
  }
  .dot[data-on='false'] {
    background: var(--paper);
    border: var(--border-normal) solid var(--ink);
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    color: var(--ink);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--solid);
    color: var(--paper);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 15px;
    letter-spacing: 0.04em;
  }
</style>
