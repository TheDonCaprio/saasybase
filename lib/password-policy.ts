/**
 * Password Strength Validation
 * ==============================
 * Centralised password policy so all auth routes enforce the same rules.
 */

export interface PasswordCheckResult {
  valid: boolean;
  message: string;
}

/**
 * Validates a password against the application's password policy.
 *
 * Rules:
 *  - Minimum 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 */
export function validatePasswordStrength(password: unknown): PasswordCheckResult {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password is required.' };
  }

  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }

  return { valid: true, message: '' };
}
