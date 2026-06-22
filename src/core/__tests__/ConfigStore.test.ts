import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigStore } from '../ConfigStore.js';
import type { ConfigYaml, HistoryYaml } from '../../types/profile.js';
import { AgywError } from '../../utils/errors.js';

let testDir: string;
let store: ConfigStore;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agyw-test-'));
  store = new ConfigStore(testDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const sampleConfig: ConfigYaml = {
  version: 1,
  antigravity_dir: '/home/user/.gemini/antigravity-cli',
  shared_source: '/home/user/.agyw/shared',
  profiles: {
    work: { path: '/home/user/.agyw/profiles/work', model: 'gemini-pro', created_at: '2024-01-01T00:00:00.000Z' },
    personal: { path: '/home/user/.agyw/profiles/personal', model: 'gemini-flash', created_at: '2024-01-02T00:00:00.000Z' },
  },
  private: ['settings.json'],
  shared: ['mcp.json'],
};

describe('ConfigStore.configExists', () => {
  it('returns false when config file does not exist', async () => {
    expect(await store.configExists()).toBe(false);
  });

  it('returns true after writing config', async () => {
    await store.writeConfig(sampleConfig);
    expect(await store.configExists()).toBe(true);
  });
});

describe('ConfigStore.readConfig / writeConfig', () => {
  it('round-trips config correctly', async () => {
    await store.writeConfig(sampleConfig);
    const result = await store.readConfig();

    expect(result.version).toBe(1);
    expect(result.antigravity_dir).toBe(sampleConfig.antigravity_dir);
    expect(result.shared_source).toBe(sampleConfig.shared_source);
    expect(result.profiles['work'].model).toBe('gemini-pro');
    expect(result.profiles['personal'].model).toBe('gemini-flash');
    expect(result.private).toEqual(['settings.json']);
    expect(result.shared).toEqual(['mcp.json']);
  });

  it('throws ERR_NO_PROFILES when config file is missing', async () => {
    await expect(store.readConfig()).rejects.toThrow(AgywError);
    await expect(store.readConfig()).rejects.toMatchObject({ code: 'ERR_NO_PROFILES' });
  });

  it('writeConfig creates directory if it does not exist', async () => {
    const nestedDir = join(testDir, 'nested', 'deep');
    const nestedStore = new ConfigStore(nestedDir);
    await nestedStore.writeConfig(sampleConfig);
    expect(await nestedStore.configExists()).toBe(true);
  });

  it('writeConfig is atomic (uses tmp then rename)', async () => {
    // Write the config and confirm no .tmp file remains
    await store.writeConfig(sampleConfig);
    const { readdir } = await import('fs/promises');
    const files = await readdir(testDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
    expect(files).toContain('config.yaml');
  });
});

describe('ConfigStore.getActive / setActive', () => {
  it('throws ERR_NO_PROFILES when active-profile.json is missing', async () => {
    await expect(store.getActive()).rejects.toThrow(AgywError);
    await expect(store.getActive()).rejects.toMatchObject({ code: 'ERR_NO_PROFILES' });
  });

  it('round-trips active profile correctly', async () => {
    const before = new Date();
    await store.setActive('work');
    const after = new Date();

    const active = await store.getActive();
    expect(active.version).toBe(1);
    expect(active.profile).toBe('work');

    const switchedAt = new Date(active.switched_at);
    expect(switchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(switchedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('updates active profile when called again', async () => {
    await store.setActive('work');
    await store.setActive('personal');
    const active = await store.getActive();
    expect(active.profile).toBe('personal');
  });

  it('setActive is atomic (uses tmp then rename)', async () => {
    await store.setActive('work');
    const { readdir } = await import('fs/promises');
    const files = await readdir(testDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
    expect(files).toContain('active-profile.json');
  });
});

describe('ConfigStore.readHistory / writeHistory', () => {
  it('returns empty array when history file does not exist', async () => {
    const history = await store.readHistory();
    expect(history).toEqual([]);
  });

  it('round-trips history correctly', async () => {
    const entries: HistoryYaml = [
      { dir: '/home/user/project-a', profile: 'work', timestamp: '2024-01-01T10:00:00.000Z' },
      { dir: '/home/user/project-b', profile: 'personal', timestamp: '2024-01-02T11:00:00.000Z' },
    ];
    await store.writeHistory(entries);
    const result = await store.readHistory();
    expect(result).toHaveLength(2);
    expect(result[0].dir).toBe('/home/user/project-a');
    expect(result[0].profile).toBe('work');
    expect(result[1].profile).toBe('personal');
  });

  it('appends to history correctly', async () => {
    const initial: HistoryYaml = [
      { dir: '/home/user/project-a', profile: 'work', timestamp: '2024-01-01T10:00:00.000Z' },
    ];
    await store.writeHistory(initial);

    const existing = await store.readHistory();
    const newEntry = { dir: '/home/user/project-b', profile: 'personal', timestamp: '2024-01-02T11:00:00.000Z' };
    await store.writeHistory([...existing, newEntry]);

    const result = await store.readHistory();
    expect(result).toHaveLength(2);
    expect(result[1].dir).toBe('/home/user/project-b');
  });

  it('writeHistory is atomic (uses tmp then rename)', async () => {
    await store.writeHistory([]);
    const { readdir } = await import('fs/promises');
    const files = await readdir(testDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
    expect(files).toContain('history.yaml');
  });
});
