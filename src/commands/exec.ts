import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { IsolatedHome } from '../core/IsolatedHome.js';
import { AgywError } from '../utils/errors.js';
import { handleError } from '../utils/cli-helpers.js';

const agywDir = () => join(homedir(), '.agyw');
const isolated = () => new IsolatedHome(agywDir(), homedir());

export async function execCommand(name: string, extraArgs: string[]): Promise<void> {
  try {
    const iso = isolated();
    await iso.prepare(name);

    if (process.platform !== 'darwin') {
      process.stderr.write(
        'agyw: warning: account isolation is only verified on macOS; on this OS agy may still share one keyring.\n',
      );
    }

    const child = spawn('agy', extraArgs, { stdio: 'inherit', env: iso.buildEnv(name) });

    child.on('error', err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        handleError(new AgywError('ERR_AGY_NOT_FOUND'));
      }
      handleError(err);
    });

    child.on('exit', code => process.exit(code ?? 0));
  } catch (err) {
    handleError(err);
  }
}

export async function listCommand(): Promise<void> {
  try {
    const homes = await isolated().list();
    if (homes.length === 0) {
      process.stdout.write('No profiles yet. Create one with: agyw exec <name>\n');
      return;
    }
    process.stdout.write('NAME      LOGGED_IN\n');
    for (const h of homes) {
      process.stdout.write(`${h.name.padEnd(10)}${h.loggedIn ? 'yes' : 'no'}\n`);
    }
  } catch (err) {
    handleError(err);
  }
}

export async function removeCommand(name: string, opts: { yes?: boolean }): Promise<void> {
  try {
    const iso = isolated();
    if (!(await iso.exists(name))) throw new AgywError('ERR_HOME_NOT_FOUND', { name });
    if (!opts.yes) throw new AgywError('ERR_REMOVE_NEEDS_CONFIRM', { name });
    await iso.remove(name);
    process.stdout.write(`Removed profile '${name}'\n`);
  } catch (err) {
    handleError(err);
  }
}

export async function doctorCommand(opts: { fix?: boolean }): Promise<void> {
  try {
    const iso = isolated();
    const homes = await iso.list();
    if (homes.length === 0) {
      process.stdout.write('No profiles yet. Create one with: agyw exec <name>\n');
      return;
    }

    let bad = false;
    for (const { name } of homes) {
      if (opts.fix) await iso.repair(name);
      const issues = await iso.diagnose(name);
      if (issues.length === 0) {
        process.stdout.write(`OK: ${name}\n`);
      } else {
        bad = true;
        for (const i of issues) process.stderr.write(`ERROR: ${name}: ${i}\n`);
      }
    }
    if (bad) process.exit(1);
  } catch (err) {
    handleError(err);
  }
}

export function removedCommand(name: string): () => never {
  return () => {
    process.stderr.write(
      `agyw: '${name}' was removed in 0.3.0. Profiles are now isolated homes; use \`agyw exec <name>\` (see \`agyw --help\`).\n`,
    );
    process.exit(1);
  };
}
