import { isValidEmail } from '../utils/validators';

export type AuthValidationResult<T extends string> = {
  isValid: boolean;
  errors: Partial<Record<T, string>>;
};

export type LoginField = 'email' | 'password';
export type RegisterField = LoginField | 'displayName' | 'username';
export type ForgotPasswordField = 'email';

export function validateLoginInput(email: string, password: string): AuthValidationResult<LoginField> {
  const errors: AuthValidationResult<LoginField>['errors'] = {};

  if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateRegisterInput(
  email: string,
  password: string,
  displayName: string,
  username: string
): AuthValidationResult<RegisterField> {
  const result = validateLoginInput(email, password) as AuthValidationResult<RegisterField>;

  if (!displayName.trim()) {
    result.errors.displayName = 'Display name is required.';
  }

  if (!username.trim()) {
    result.errors.username = 'Username is required.';
  }

  return {
    isValid: Object.keys(result.errors).length === 0,
    errors: result.errors,
  };
}

export function validateForgotPasswordInput(email: string): AuthValidationResult<ForgotPasswordField> {
  const errors: AuthValidationResult<ForgotPasswordField>['errors'] = {};

  if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
