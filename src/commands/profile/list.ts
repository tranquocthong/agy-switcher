import { createProfileManager } from '../../core/factory.js';
import { ConfigStore } from '../../core/ConfigStore.js';
import { HistoryTracker } from '../../core/HistoryTracker.js';
import { handleError } from '../../utils/cli-helpers.js';
import { homedir } from 'os';
import { join } from 'path';

export async function listProfilesCommand(): Promise<void> {
  try {
    const agywDir = join(homedir(), '.agyw');
    const configStore = new ConfigStore(agywDir);
    const historyTracker = new HistoryTracker(configStore);

    const config = await configStore.readConfig();
    const active = await configStore.getActive();
    const lastUsed = await historyTracker.getLastUsedForCwd(process.cwd());

    const names = Object.keys(config.profiles);
    const colW = Math.max(4, ...names.map(n => n.length)) + 2;

    const header = 'NAME'.padEnd(colW) + 'ACTIVE'.padEnd(8) + 'LAST_USED'.padEnd(11) + 'MODEL';
    process.stdout.write(header + '\n');
    process.stdout.write('-'.repeat(header.length) + '\n');

    for (const name of names) {
      const isActive = name === active.profile ? '*' : '';
      const isLast = name === lastUsed ? 'yes' : '';
      const model = config.profiles[name].model ?? '';
      process.stdout.write(
        name.padEnd(colW) + isActive.padEnd(8) + isLast.padEnd(11) + model + '\n',
      );
    }
  } catch (err) {
    handleError(err);
  }
}
