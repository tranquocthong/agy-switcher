import { ConfigStore } from '../core/ConfigStore.js';
import { SymlinkEngine } from '../core/SymlinkEngine.js';
import { ANTIGRAVITY_DIR, SHARED_ITEMS } from '../core/factory.js';
import { handleError } from '../utils/cli-helpers.js';
import { homedir } from 'os';
import { join } from 'path';

export async function statusCommand(): Promise<void> {
  try {
    const agywDir = join(homedir(), '.agyw');
    const configStore = new ConfigStore(agywDir);
    const active = await configStore.getActive();
    const config = await configStore.readConfig();
    const profile = config.profiles[active.profile];

    process.stdout.write(`Active profile: ${active.profile}\n`);
    process.stdout.write(`Path:           ${profile?.path ?? 'unknown'}\n`);
    process.stdout.write(`Switched at:    ${active.switched_at}\n`);

    const symlinkEngine = new SymlinkEngine(ANTIGRAVITY_DIR, join(agywDir, 'shared'), SHARED_ITEMS);
    const health = await symlinkEngine.checkHealth();
    process.stdout.write(`Symlinks:       ${health.ok} ok, ${health.broken} broken\n`);
  } catch (err) {
    handleError(err);
  }
}
