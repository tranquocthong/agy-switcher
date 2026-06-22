import { writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { AgywError } from '../utils/errors.js';

interface LockData { pid: number; timestamp: number; }

export class LockManager {
  private lockPath: string;
  private staleTimeout = 30_000; // 30 seconds

  constructor(agywDir: string) {
    this.lockPath = join(agywDir, 'agyw.lock');
  }

  async acquire(): Promise<void> {
    if (existsSync(this.lockPath)) {
      const raw = await readFile(this.lockPath, 'utf-8');
      const data: LockData = JSON.parse(raw);
      const age = Date.now() - data.timestamp;
      if (age < this.staleTimeout) {
        throw new AgywError('ERR_CONCURRENT_SWITCH');
      }
      await unlink(this.lockPath);
    }
    await writeFile(this.lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  }

  async release(): Promise<void> {
    if (existsSync(this.lockPath)) {
      await unlink(this.lockPath);
    }
  }
}
