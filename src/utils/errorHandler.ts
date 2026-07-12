import { isAppServiceError } from '../services/errors';
import type { AppError } from '../services/types';
import { captureError } from '../lib/sentry';

export function getUserErrorMessage(error: unknown): string {
  if (isAppServiceError(error)) {
    return error.appError.userMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function handleAppError(error: unknown): AppError {
  captureError(error, { source: 'handleAppError' });

  if (isAppServiceError(error)) {
    return error.appError;
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      userMessage: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unknown error',
    userMessage: 'Something went wrong. Please try again.',
  };
}
