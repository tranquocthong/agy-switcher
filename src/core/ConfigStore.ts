import { readFile, writeFile, rename, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { load, dump } from 'js-yaml';
import { AgywError } from '../utils/errors.js';
import type { ConfigYaml, ActiveProfile, HistoryYaml } from '../types/profile.js';

export class ConfigStore {
  readonly agywDir: string;
  private readonly configPath: string;
  private readonly activeProfilePath: string;
  private readonly historyPath: string;

  constructor(agywDir = join(homedir(), '.agyw')) {
    this.agywDir = agywDir;
    this.configPath = join(agywDir, 'config.yaml');
    this.activeProfilePath = join(agywDir, 'active-profile.json');
    this.historyPath = join(agywDir, 'history.yaml');
  }

  async readConfig(): Promise<ConfigYaml> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      return load(raw) as ConfigYaml;
    } catch {
      throw new AgywError('ERR_NO_PROFILES');
    }
  }

  async writeConfig(config: ConfigYaml): Promise<void> {
    await mkdir(this.agywDir, { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    await writeFile(tmp, dump(config), 'utf-8');
    await rename(tmp, this.configPath);
  }

  async configExists(): Promise<boolean> {
    try {
      await access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async getActive(): Promise<ActiveProfile> {
    try {
      const raw = await readFile(this.activeProfilePath, 'utf-8');
      return JSON.parse(raw) as ActiveProfile;
    } catch {
      throw new AgywError('ERR_NO_PROFILES');
    }
  }

  async setActive(name: string): Promise<void> {
    await mkdir(this.agywDir, { recursive: true });
    const active: ActiveProfile = {
      version: 1,
      profile: name,
      switched_at: new Date().toISOString(),
    };
    const tmp = `${this.activeProfilePath}.tmp`;
    await writeFile(tmp, JSON.stringify(active, null, 2), 'utf-8');
    await rename(tmp, this.activeProfilePath);
  }

  async readHistory(): Promise<HistoryYaml> {
    try {
      const raw = await readFile(this.historyPath, 'utf-8');
      return (load(raw) as HistoryYaml) ?? [];
    } catch {
      return [];
    }
  }

  async writeHistory(history: HistoryYaml): Promise<void> {
    await mkdir(this.agywDir, { recursive: true });
    const tmp = `${this.historyPath}.tmp`;
    await writeFile(tmp, dump(history), 'utf-8');
    await rename(tmp, this.historyPath);
  }
}
