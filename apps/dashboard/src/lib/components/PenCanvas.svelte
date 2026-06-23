<script lang="ts">
  import { onMount } from 'svelte';

  export type PenHandle = {
    clear: () => void;
    isEmpty: () => boolean;
    getBlob: (type?: string) => Promise<Blob | null>;
  };

  let {
    onReady,
    strokeWidth = 2.5,
  }: { onReady?: (h: PenHandle) => void; strokeWidth?: number } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;
  let drawing = false;
  let dirty = false;

  function setupCanvas() {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Preserve current bitmap when resizing.
    const old = ctx?.getImageData(0, 0, canvasEl.width, canvasEl.height);
    canvasEl.width = Math.floor(rect.width * dpr);
    canvasEl.height = Math.floor(rect.height * dpr);
    const c = canvasEl.getContext('2d');
    if (!c) return;
    c.scale(dpr, dpr);
    c.strokeStyle = '#000';
    c.lineWidth = strokeWidth;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (old && old.width === canvasEl.width && old.height === canvasEl.height) {
      c.putImageData(old, 0, 0);
    }
    ctx = c;
  }

  function getPos(e: PointerEvent): [number, number] {
    if (!canvasEl) return [0, 0];
    const rect = canvasEl.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onDown(e: PointerEvent) {
    if (!ctx || !canvasEl) return;
    e.preventDefault();
    try {
      canvasEl.setPointerCapture(e.pointerId);
    } catch {
      /* not all pointer types support capture */
    }
    drawing = true;
    const [x, y] = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Emit a single tap as a dot
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    dirty = true;
  }

  function onMove(e: PointerEvent) {
    if (!drawing || !ctx) return;
    e.preventDefault();
    const [x, y] = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onUp(e: PointerEvent) {
    if (canvasEl) {
      try {
        canvasEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drawing = false;
  }

  function clear() {
    if (!canvasEl || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.restore();
    dirty = false;
  }

  function isEmpty(): boolean {
    return !dirty;
  }

  function getBlob(type = 'image/png'): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!canvasEl) {
        resolve(null);
        return;
      }
      // Composite on white so PNG isn't transparent — OCR engines need it.
      const out = document.createElement('canvas');
      out.width = canvasEl.width;
      out.height = canvasEl.height;
      const oc = out.getContext('2d');
      if (!oc) {
        resolve(null);
        return;
      }
      oc.fillStyle = '#fff';
      oc.fillRect(0, 0, out.width, out.height);
      oc.drawImage(canvasEl, 0, 0);
      out.toBlob(resolve, type);
    });
  }

  onMount(() => {
    setupCanvas();
    onReady?.({ clear, isEmpty, getBlob });
    const ro = new ResizeObserver(() => setupCanvas());
    if (canvasEl) ro.observe(canvasEl);
    return () => ro.disconnect();
  });
</script>

<canvas
  bind:this={canvasEl}
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  onpointerleave={onUp}
></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--paper);
    touch-action: none;
    cursor: crosshair;
  }
</style>
