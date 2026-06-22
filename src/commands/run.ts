import { spawn } from 'child_process';
import { createProfileManager } from '../core/factory.js';
import { AgywError } from '../utils/errors.js';
import { handleError } from '../utils/cli-helpers.js';

export async function runCommand(name: string, extraArgs: string[]): Promise<void> {
  try {
    const manager = createProfileManager();
    await manager.switch(name);

    const agyBin = 'agy';
    const child = spawn(agyBin, extraArgs, { stdio: 'inherit' });

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
