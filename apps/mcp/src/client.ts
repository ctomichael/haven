import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://haven:haven@localhost:5432/haven';

// Own pool — separate from the backend's. Smaller default since MCP
// callers tend to be one-shot (Hermes spawns a subprocess per session).
export const sql = postgres(DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 5,
  onnotice: () => {
    /* suppress NOTICE noise */
  },
});
