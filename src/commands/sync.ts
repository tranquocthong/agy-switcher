import { ConfigStore } from '../core/ConfigStore.js';
import { FileSwapper } from '../core/FileSwapper.js';
import { ANTIGRAVITY_DIR, PRIVATE_ITEMS } from '../core/factory.js';
import { handleError } from '../utils/cli-helpers.js';
import { homedir } from 'os';
import { join } from 'path';

export async function syncCommand(): Promise<void> {
  try {
    const agywDir = join(homedir(), '.agyw');
    const configStore = new ConfigStore(agywDir);
    const active = await configStore.getActive();
    const fileSwapper = new FileSwapper(ANTIGRAVITY_DIR, join(agywDir, 'profiles'), PRIVATE_ITEMS);
    await fileSwapper.save(active.profile);
    process.stdout.write(`Synced profile '${active.profile}'.\n`);
  } catch (err) {
    handleError(err);
  }
}
