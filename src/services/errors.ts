import type { AppError } from './types';

export class AppServiceError extends Error {
  appError: AppError;

  constructor(appError: AppError) {
    super(appError.userMessage);
    this.name = 'AppServiceError';
    this.appError = appError;
  }
}

export function createServiceError(code: string, message: string, userMessage: string): AppServiceError {
  return new AppServiceError({ code, message, userMessage });
}

export function isAppServiceError(error: unknown): error is AppServiceError {
  return error instanceof AppServiceError;
}
