import { createProfileManager } from '../../core/factory.js';
import { handleError } from '../../utils/cli-helpers.js';

export async function addProfileCommand(name: string, opts: { clone?: string }): Promise<void> {
  try {
    const manager = createProfileManager();
    await manager.addProfile(name, opts.clone);
    process.stdout.write(`Profile '${name}' created.\n`);

    await manager.switch(name);
    process.stdout.write(`Switched to '${name}'.\n`);
    process.stdout.write('\nRun `agy auth login` to authenticate, then `agyw switch <previous>` when done.\n');
  } catch (err) {
    handleError(err);
  }
}
