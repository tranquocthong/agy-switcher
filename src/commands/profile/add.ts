import { createProfileManager } from '../../core/factory.js';
import { handleError } from '../../utils/cli-helpers.js';

export async function addProfileCommand(name: string, opts: { clone?: string }): Promise<void> {
  try {
    const manager = createProfileManager();
    await manager.addProfile(name, opts.clone);
    process.stdout.write(`Profile '${name}' created.\n`);
    process.stdout.write('Run `agy auth login` to authenticate this profile.\n');
  } catch (err) {
    handleError(err);
  }
}
