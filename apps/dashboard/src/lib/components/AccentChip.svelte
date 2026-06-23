<script lang="ts">
  import type { Accent } from '$lib/tokens';

  let {
    accent,
    label,
  }: { accent: Accent; label: string } = $props();
</script>

<span class="chip" style="--tint: var(--accent-{accent}-tint);">{label}</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    background: var(--tint);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
</style>
