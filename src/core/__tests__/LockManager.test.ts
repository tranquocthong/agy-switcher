import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { LockManager } from '../LockManager.js';
import { AgywError } from '../../utils/errors.js';

let testDir: string;
let lock: LockManager;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agyw-lock-test-'));
  lock = new LockManager(testDir);
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(testDir, { recursive: true, force: true });
});

describe('LockManager.acquire', () => {
  it('creates a lock file with pid and timestamp', async () => {
    await lock.acquire();

    const raw = await readFile(join(testDir, 'agyw.lock'), 'utf-8');
    const data = JSON.parse(raw);

    expect(data.pid).toBe(process.pid);
    expect(typeof data.timestamp).toBe('number');
    expect(data.timestamp).toBeGreaterThan(0);
  });

  it('throws ERR_CONCURRENT_SWITCH when lock is fresh (< 30s)', async () => {
    await lock.acquire();

    await expect(lock.acquire()).rejects.toThrow(AgywError);
    await expect(lock.acquire()).rejects.toMatchObject({ code: 'ERR_CONCURRENT_SWITCH' });
  });

  it('removes stale lock (timestamp 60s ago) and acquires new lock', async () => {
    const staleTimestamp = Date.now() - 60_000;
    await writeFile(
      join(testDir, 'agyw.lock'),
      JSON.stringify({ pid: 99999, timestamp: staleTimestamp }),
    );

    // Should not throw — stale lock gets cleared and replaced
    await expect(lock.acquire()).resolves.toBeUndefined();

    const raw = await readFile(join(testDir, 'agyw.lock'), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);
    expect(data.timestamp).toBeGreaterThan(staleTimestamp);
  });
});

describe('LockManager.release', () => {
  it('removes the lock file after acquire', async () => {
    const { existsSync } = await import('fs');

    await lock.acquire();
    expect(existsSync(join(testDir, 'agyw.lock'))).toBe(true);

    await lock.release();
    expect(existsSync(join(testDir, 'agyw.lock'))).toBe(false);
  });

  it('is safe to call when no lock file exists (no-op)', async () => {
    await expect(lock.release()).resolves.toBeUndefined();
  });
});

describe('LockManager finally-block pattern', () => {
  it('releases lock even when the guarded operation throws', async () => {
    const { existsSync } = await import('fs');

    await lock.acquire();
    expect(existsSync(join(testDir, 'agyw.lock'))).toBe(true);

    let caughtError: unknown;
    try {
      throw new Error('simulated operation failure');
    } catch (err) {
      caughtError = err;
    } finally {
      await lock.release();
    }

    expect(existsSync(join(testDir, 'agyw.lock'))).toBe(false);
    expect(caughtError).toBeInstanceOf(Error);
  });
});
