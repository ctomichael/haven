<script lang="ts">
  let {
    on,
    onchange,
    disabled = false,
    label = 'Toggle',
  }: {
    on: boolean;
    onchange?: (next: boolean) => void;
    disabled?: boolean;
    label?: string;
  } = $props();
</script>

<button
  type="button"
  class="switch"
  aria-pressed={on}
  aria-disabled={disabled}
  aria-label={label}
  onclick={(e) => {
    e.stopPropagation();
    if (!disabled) onchange?.(!on);
  }}
>
  <span class="knob" aria-hidden="true"></span>
</button>

<style>
  .switch {
    width: 62px;
    height: 34px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    border-radius: 999px;
    position: relative;
    padding: 0;
    cursor: pointer;
  }
  .switch[aria-pressed='true'] {
    background: var(--ink);
  }
  .switch[aria-disabled='true'] {
    cursor: default;
    border-color: var(--disabled);
  }
  .knob {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 22px;
    height: 22px;
    background: var(--ink);
    border-radius: 50%;
    transition: left 200ms ease, background 200ms ease;
  }
  .switch[aria-pressed='true'] .knob {
    background: var(--paper);
    left: 32px;
  }
</style>
