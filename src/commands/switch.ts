import { createProfileManager } from '../core/factory.js';
import { handleError } from '../utils/cli-helpers.js';

export async function switchCommand(name: string): Promise<void> {
  try {
    const manager = createProfileManager();
    await manager.switch(name);
    process.stdout.write(`Switched to profile: ${name}\n`);
  } catch (err) {
    handleError(err);
  }
}
