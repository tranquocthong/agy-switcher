import type { ConfigStore } from './ConfigStore.js';

const MAX_HISTORY = 100;

export class HistoryTracker {
  constructor(private configStore: ConfigStore) {}

  async record(dir: string, profile: string): Promise<void> {
    const history = await this.configStore.readHistory();
    history.push({ dir, profile, timestamp: new Date().toISOString() });

    // Trim oldest entries when over the limit
    const trimmed = history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history;
    await this.configStore.writeHistory(trimmed);
  }

  async getLastUsedForCwd(dir: string): Promise<string | undefined> {
    const history = await this.configStore.readHistory();
    // Iterate from the end to find the most recent entry for this dir
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].dir === dir) {
        return history[i].profile;
      }
    }
    return undefined;
  }
}
