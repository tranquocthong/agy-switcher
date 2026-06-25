import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgywError } from '../utils/errors.js';

const execFileAsync = promisify(execFile);

export interface RunningProcess {
  pid: number;
  label: string;
}

/**
 * Detects Antigravity processes that hold OAuth credentials in memory.
 *
 * macOS: checks for Antigravity IDE (language_server) and the agy CLI.
 * Linux: checks for the agy CLI only (no IDE on Linux).
 *
 * If such a process is alive during a switch, it reverts the keychain/token
 * to its own account and cross-contaminates profiles. agyw cannot swap
 * credentials safely while it runs.
 */
export class ProcessGuard {
  // `listProcesses` is injectable so tests don't shell out to the real `ps`.
  constructor(private listProcesses: () => Promise<string> = defaultLister) {}

  async findRunning(): Promise<RunningProcess[]> {
    let out: string;
    try {
      out = await this.listProcesses();
    } catch {
      // Can't enumerate processes — don't block the user on an unrelated failure.
      return [];
    }

    const found: RunningProcess[] = [];
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^(\d+)\s+(.*)$/);
      if (!match) continue;

      const pid = Number(match[1]);
      const cmd = match[2];
      if (pid === process.pid) continue;

      // Antigravity IDE auth daemon — macOS only (no IDE on Linux)
      if (process.platform === 'darwin' &&
          cmd.includes('Antigravity.app') && cmd.includes('language_server')) {
        found.push({ pid, label: 'Antigravity IDE (language_server)' });
        continue;
      }

      // `agy` CLI — matches the bare executable, not paths like `antigravity-cli`
      // and not `agyw` itself.
      if (/(^|\/)agy(\s|$)/.test(cmd) && !/(^|\/)agyw(\s|$)/.test(cmd)) {
        found.push({ pid, label: 'agy CLI' });
      }
    }
    return found;
  }

  async assertNotRunning(): Promise<void> {
    const running = await this.findRunning();
    if (running.length === 0) return;

    const detail = running.map(p => `${p.label} (pid ${p.pid})`).join(', ');
    throw new AgywError('ERR_ANTIGRAVITY_RUNNING', { detail });
  }
}

const defaultLister = async (): Promise<string> => {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command=']);
  return stdout;
};
