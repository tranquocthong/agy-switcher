import { createInterface } from 'readline';
import { createProfileManager } from '../../core/factory.js';
import { handleError } from '../../utils/cli-helpers.js';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' [y/N] ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function removeProfileCommand(name: string): Promise<void> {
  try {
    const ok = await confirm(`Remove profile '${name}'?`);
    if (!ok) {
      process.stdout.write('Aborted.\n');
      return;
    }
    const manager = createProfileManager();
    await manager.removeProfile(name);
    process.stdout.write(`Profile '${name}' removed.\n`);
  } catch (err) {
    handleError(err);
  }
}
