import { describe, it, expect } from 'vitest';
import { AgywError } from '../errors.js';

describe('AgywError', () => {
  it('sets code and exitCode', () => {
    const err = new AgywError('ERR_HOME_NOT_FOUND', { name: 'acme' });
    expect(err.code).toBe('ERR_HOME_NOT_FOUND');
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe('AgywError');
    expect(err instanceof Error).toBe(true);
  });

  it('interpolates every occurrence of a placeholder', () => {
    const err = new AgywError('ERR_HOME_NOT_FOUND', { name: 'acme' });
    expect(err.message.match(/acme/g)).toHaveLength(2);
    expect(err.message).not.toContain('{name}');
  });

  it('works without context when there are no placeholders', () => {
    expect(new AgywError('ERR_AGY_NOT_FOUND').message).toContain('PATH');
  });

  const allCodes: ConstructorParameters<typeof AgywError>[0][] = [
    'ERR_AGY_NOT_FOUND',
    'ERR_INVALID_HOME_NAME',
    'ERR_HOME_NOT_FOUND',
    'ERR_REMOVE_NEEDS_CONFIRM',
  ];

  it.each(allCodes)('instantiates %s without throwing', code => {
    expect(() => new AgywError(code)).not.toThrow();
  });
});
