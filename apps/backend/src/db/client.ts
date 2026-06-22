import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://haven:haven@localhost:5432/haven';

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 5,
  onnotice: () => {
    /* suppress NOTICE noise in dev */
  },
});

export async function pingDb(): Promise<{
  ok: boolean;
  error?: string;
  latency_ms?: number;
}> {
  const start = performance.now();
  try {
    await sql`select 1`;
    return { ok: true, latency_ms: Math.round(performance.now() - start) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
