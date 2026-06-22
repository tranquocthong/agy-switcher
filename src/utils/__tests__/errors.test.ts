import { describe, it, expect } from 'vitest';
import { AgywError } from '../errors.js';

describe('AgywError', () => {
  it('sets code and exitCode', () => {
    const err = new AgywError('ERR_PROFILE_NOT_FOUND', { name: 'acme' });
    expect(err.code).toBe('ERR_PROFILE_NOT_FOUND');
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe('AgywError');
    expect(err instanceof Error).toBe(true);
  });

  it('interpolates context placeholders', () => {
    const err = new AgywError('ERR_PROFILE_NOT_FOUND', { name: 'acme' });
    expect(err.message).toContain('acme');
  });

  it('handles ERR_AMBIGUOUS_PROFILE with matches', () => {
    const err = new AgywError('ERR_AMBIGUOUS_PROFILE', { name: 'w', matches: 'work, web-agency' });
    expect(err.message).toContain('work, web-agency');
  });

  it('handles ERR_ENV_WRITE_FAILED with detail', () => {
    const err = new AgywError('ERR_ENV_WRITE_FAILED', { detail: 'Permission denied' });
    expect(err.message).toContain('Permission denied');
  });

  it('works without context when no placeholders', () => {
    const err = new AgywError('ERR_NO_PROFILES');
    expect(err.message).toContain('agyw init');
  });

  const allCodes: Parameters<typeof AgywError>[0][] = [
    'ERR_PROFILE_NOT_FOUND', 'ERR_PROFILE_EXISTS', 'ERR_REMOVE_ACTIVE',
    'ERR_REMOVE_LAST', 'ERR_AMBIGUOUS_PROFILE', 'ERR_NO_PROFILES',
    'ERR_SYMLINK_CONFLICT', 'ERR_AGY_NOT_FOUND', 'ERR_ANTIGRAVITY_NOT_INIT',
    'ERR_CONCURRENT_SWITCH', 'ERR_ENV_WRITE_FAILED',
  ];

  it.each(allCodes)('instantiates %s without throwing', (code) => {
    expect(() => new AgywError(code)).not.toThrow();
  });
});
