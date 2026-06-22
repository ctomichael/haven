import { getContext, setContext } from 'svelte';

export type Surface = 'eink' | 'phone';

const KEY = Symbol('haven-surface');

export function provideSurface(surface: Surface): void {
  setContext(KEY, surface);
}

export function useSurface(): Surface {
  return (getContext(KEY) as Surface | undefined) ?? 'eink';
}

export function transitionsEnabled(): boolean {
  return useSurface() === 'phone';
}
