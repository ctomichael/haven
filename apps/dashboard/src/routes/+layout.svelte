<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <style>
    :root {
      color-scheme: light;
      --ink: #000;
      --ink-2: #4a4a4a;
      --paper: #fff;
      --paper-2: #f0f0f0;
      font-family:
        ui-sans-serif, system-ui, -apple-system, 'Inter', 'Helvetica Neue', Arial, sans-serif;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--paper);
      color: var(--ink);
    }
    * { box-sizing: border-box; }
  </style>
</svelte:head>

{@render children()}
