import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { IsolatedHome } from '../core/IsolatedHome.js';
import { AgywError } from '../utils/errors.js';
import { handleError } from '../utils/cli-helpers.js';

export async function execCommand(name: string, extraArgs: string[]): Promise<void> {
  try {
    const isolated = new IsolatedHome(join(homedir(), '.agyw'), homedir());
    await isolated.prepare(name);

    const child = spawn('agy', extraArgs, {
      stdio: 'inherit',
      env: isolated.buildEnv(name),
    });

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

export async function homesCommand(): Promise<void> {
  try {
    const isolated = new IsolatedHome(join(homedir(), '.agyw'), homedir());
    const homes = await isolated.list();
    if (homes.length === 0) {
      process.stdout.write('No isolated homes yet. Create one with: agyw exec <name>\n');
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
