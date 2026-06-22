import { spawn } from 'node:child_process';

export type SquawkResult = {
  /** True only when squawk ran successfully AND reported no issues. */
  safe: boolean;
  /** True when the squawk binary was found and executed; false when missing or errored. */
  squawk_available: boolean;
  /** Raw stdout from squawk when it found issues (JSON). Empty when safe. */
  output?: string;
  /** Captured stderr or runner error. */
  error?: string;
};

function which(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ['--version'], { stdio: 'pipe' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

export async function squawkAvailable(): Promise<boolean> {
  return which('squawk');
}

/**
 * Run squawk against a migration file. Fail-closed: anything squawk doesn't
 * green-light is treated as unsafe. If squawk itself is missing, the result
 * is unsafe with `squawk_available: false` so the caller can prompt install.
 */
export async function squawkLint(
  filePath: string,
  configPath?: string,
): Promise<SquawkResult> {
  if (!(await squawkAvailable())) {
    return {
      safe: false,
      squawk_available: false,
      error: 'squawk not on PATH — install via `npm install -g squawk-cli`',
    };
  }

  const args = ['lint', '--reporter', 'json'];
  if (configPath) args.push('--config', configPath);
  args.push(filePath);

  return new Promise((resolve) => {
    const proc = spawn('squawk', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (e) =>
      resolve({
        safe: false,
        squawk_available: true,
        error: e.message,
      }),
    );
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ safe: true, squawk_available: true });
        return;
      }
      // Non-zero exit means squawk found issues OR errored.
      resolve({
        safe: false,
        squawk_available: true,
        output: stdout.trim() || undefined,
        error: stderr.trim() || undefined,
      });
    });
  });
}
