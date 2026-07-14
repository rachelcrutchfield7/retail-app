export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const canRetry =
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('.') || specifier.startsWith('/')) &&
      !/\.[cm]?[jt]sx?$/.test(specifier);

    if (!canRetry) {
      throw error;
    }

    try {
      return await defaultResolve(`${specifier}.js`, context, defaultResolve);
    } catch {
      return defaultResolve(`${specifier}.ts`, context, defaultResolve);
    }
  }
}
