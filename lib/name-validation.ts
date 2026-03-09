const MAX_NAME_PART_LENGTH = 40;
const MAX_FULL_NAME_LENGTH = 80;
const REPEATED_SHORT_PATTERN = /^(.{1,3})\1{3,}$/;
const REPEATED_CHARACTER_PATTERN = /(.)\1{3,}/;
const NAME_PART_ALLOWED_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeNamePart(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? '');
}

function looksLikeGibberish(value: string): boolean {
  const simplified = value.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
  if (simplified.length < 6) {
    return false;
  }

  if (REPEATED_CHARACTER_PATTERN.test(simplified)) {
    return true;
  }

  return REPEATED_SHORT_PATTERN.test(simplified);
}

function validateSingleNamePart(label: string, value: string): string | null {
  if (!value) {
    return null;
  }

  if (value.length > MAX_NAME_PART_LENGTH) {
    return `${label} must be ${MAX_NAME_PART_LENGTH} characters or fewer.`;
  }

  if (!NAME_PART_ALLOWED_PATTERN.test(value)) {
    return `${label} contains unsupported characters.`;
  }

  if (looksLikeGibberish(value)) {
    return `${label} does not look valid.`;
  }

  return null;
}

export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const normalized = normalizeWhitespace(fullName ?? '');
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const [firstName, ...rest] = normalized.split(' ');
  return {
    firstName: firstName ?? '',
    lastName: rest.join(' '),
  };
}

export function validateAndFormatPersonName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): {
  ok: boolean;
  error?: string;
  firstName: string;
  lastName: string;
  fullName: string | null;
} {
  const fromFullName = input.fullName != null ? splitFullName(input.fullName) : null;
  const firstName = normalizeNamePart(input.firstName ?? fromFullName?.firstName ?? '');
  const lastName = normalizeNamePart(input.lastName ?? fromFullName?.lastName ?? '');
  const fullName = normalizeWhitespace([firstName, lastName].filter(Boolean).join(' '));

  if (!firstName && !lastName) {
    return { ok: true, firstName: '', lastName: '', fullName: null };
  }

  const firstNameError = validateSingleNamePart('First name', firstName);
  if (firstNameError) {
    return { ok: false, error: firstNameError, firstName, lastName, fullName: fullName || null };
  }

  const lastNameError = validateSingleNamePart('Last name', lastName);
  if (lastNameError) {
    return { ok: false, error: lastNameError, firstName, lastName, fullName: fullName || null };
  }

  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${MAX_FULL_NAME_LENGTH} characters or fewer.`,
      firstName,
      lastName,
      fullName: fullName || null,
    };
  }

  return {
    ok: true,
    firstName,
    lastName,
    fullName: fullName || null,
  };
}
