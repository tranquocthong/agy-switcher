import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigStore } from '../ConfigStore.js';
import { HistoryTracker } from '../HistoryTracker.js';

let testDir: string;
let configStore: ConfigStore;
let tracker: HistoryTracker;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agyw-historytracker-'));
  configStore = new ConfigStore(testDir);
  tracker = new HistoryTracker(configStore);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('HistoryTracker.record()', () => {
  it('appends an entry to history when history is empty', async () => {
    await tracker.record('/home/user/project', 'work');

    const history = await configStore.readHistory();
    expect(history).toHaveLength(1);
    expect(history[0].dir).toBe('/home/user/project');
    expect(history[0].profile).toBe('work');
    expect(history[0].timestamp).toBeTruthy();
  });

  it('appends subsequent entries to history', async () => {
    await tracker.record('/home/user/project-a', 'work');
    await tracker.record('/home/user/project-b', 'personal');

    const history = await configStore.readHistory();
    expect(history).toHaveLength(2);
    expect(history[0].profile).toBe('work');
    expect(history[1].profile).toBe('personal');
  });

  it('stores a valid ISO timestamp', async () => {
    const before = new Date();
    await tracker.record('/home/user/project', 'work');
    const after = new Date();

    const history = await configStore.readHistory();
    const ts = new Date(history[0].timestamp);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('trims to 100 entries when over the limit', async () => {
    // Pre-populate 100 entries
    const entries = Array.from({ length: 100 }, (_, i) => ({
      dir: `/home/user/project-${i}`,
      profile: 'old',
      timestamp: new Date(Date.now() - (100 - i) * 1000).toISOString(),
    }));
    await configStore.writeHistory(entries);

    // Record one more — should evict the oldest
    await tracker.record('/home/user/new-project', 'new');

    const history = await configStore.readHistory();
    expect(history).toHaveLength(100);
    // Oldest entry (project-0) should be gone
    expect(history.some(e => e.dir === '/home/user/project-0')).toBe(false);
    // Newest entry should be present
    expect(history[history.length - 1].dir).toBe('/home/user/new-project');
    expect(history[history.length - 1].profile).toBe('new');
  });
});

describe('HistoryTracker.getLastUsedForCwd()', () => {
  it('returns the most recent profile used in the given dir', async () => {
    await tracker.record('/home/user/project', 'work');
    await tracker.record('/home/user/project', 'personal');

    const result = await tracker.getLastUsedForCwd('/home/user/project');
    expect(result).toBe('personal');
  });

  it('returns undefined for an unknown directory', async () => {
    await tracker.record('/home/user/other-project', 'work');

    const result = await tracker.getLastUsedForCwd('/home/user/project');
    expect(result).toBeUndefined();
  });

  it('returns undefined when history is empty', async () => {
    const result = await tracker.getLastUsedForCwd('/home/user/project');
    expect(result).toBeUndefined();
  });

  it('is not confused by similar directory prefixes', async () => {
    await tracker.record('/home/user/project', 'work');
    await tracker.record('/home/user/project-extra', 'personal');

    const result = await tracker.getLastUsedForCwd('/home/user/project');
    expect(result).toBe('work');
  });
});
