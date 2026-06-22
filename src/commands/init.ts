import { ANTIGRAVITY_DIR, createProfileManager } from '../core/factory.js';
import { handleError } from '../utils/cli-helpers.js';

export async function initCommand(): Promise<void> {
  try {
    const manager = createProfileManager();
    await manager.init(ANTIGRAVITY_DIR);
    process.stdout.write('agyw initialized. Active profile: default\n');
    process.stdout.write('Run `agyw profile list` to see profiles.\n');
  } catch (err) {
    handleError(err);
  }
}
