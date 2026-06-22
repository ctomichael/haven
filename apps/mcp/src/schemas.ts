import { z } from 'zod';

/**
 * Every tool call accepts an optional `actor` — the user being
 * represented (handle slug: 'michael', 'fiona', 'wall', 'system').
 * Captured into audit_log for attribution.
 */
export const ACTOR = z
  .string()
  .optional()
  .describe(
    "Optional user being represented (handle: 'michael', 'fiona', 'wall', 'system'). Recorded in audit_log.",
  );
