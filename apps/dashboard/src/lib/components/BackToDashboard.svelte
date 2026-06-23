<script lang="ts">
  let { href = '/', label = 'DASHBOARD' }: { href?: string; label?: string } = $props();
</script>

<a class="back" {href}>
  <span class="arrow">‹</span>
  {label}
</a>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 22px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    text-decoration: none;
  }
  .arrow {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 28px;
    line-height: 0.9;
  }
</style>
