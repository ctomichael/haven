// Global "UI is mid-operation" signal.
//
// The layout defers a deploy-triggered hard reload (window.location.reload,
// fired when the backend's started_at changes) while anything here is active,
// so an in-progress voice recording / upload / save isn't nuked mid-flight.
// The reload is applied the moment the last operation finishes.
//
// Scoped deliberately to *active operations*, not idle unsaved content — a
// stray draft in a textbox must not be able to block deploys indefinitely.
// The live-data reload path (invalidateAll) is unaffected; it never remounts
// components, so it's safe to run regardless of busy state.

let count = $state(0);
const keys = new Set<string>();

export const busy = {
  get active(): boolean {
    return count > 0;
  },
  /** Mark a named unit of work active or done. Idempotent per key. */
  set(key: string, on: boolean): void {
    const had = keys.has(key);
    if (on && !had) {
      keys.add(key);
      count++;
    } else if (!on && had) {
      keys.delete(key);
      count--;
    }
  },
};
