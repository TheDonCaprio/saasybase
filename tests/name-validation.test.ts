import { describe, expect, it } from 'vitest';
import { splitFullName, validateAndFormatPersonName } from '../lib/name-validation';

describe('name validation', () => {
  it('splits full names into first and last name', () => {
    expect(splitFullName('Donny Adewale')).toEqual({
      firstName: 'Donny',
      lastName: 'Adewale',
    });
  });

  it('accepts normal names and normalizes whitespace', () => {
    expect(
      validateAndFormatPersonName({
        firstName: '  Donny ',
        lastName: '  Adewale  ',
      })
    ).toEqual({
      ok: true,
      firstName: 'Donny',
      lastName: 'Adewale',
      fullName: 'Donny Adewale',
    });
  });

  it('rejects obvious gibberish patterns', () => {
    const result = validateAndFormatPersonName({
      firstName: 'fhfhfhfhfhfh',
      lastName: 'Adewale',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('First name');
  });

  it('rejects unsupported characters', () => {
    const result = validateAndFormatPersonName({
      firstName: 'Donny<script>',
      lastName: 'Adewale',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('unsupported characters');
  });
});
