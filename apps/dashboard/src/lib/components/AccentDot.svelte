<script lang="ts">
  import type { Accent } from '$lib/tokens';

  let { accent, size = 10 }: { accent: Accent; size?: number } = $props();
</script>

<span class="dot" style="--solid: var(--accent-{accent}); --size: {size}px;" aria-hidden="true"></span>

<style>
  .dot {
    display: inline-block;
    width: var(--size);
    height: var(--size);
    background: var(--solid);
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
