import test from 'node:test';

const liveSupabaseEnabled = process.env.RUN_LIVE_SUPABASE_TESTS === '1';

export function liveSupabaseTest(name, optionsOrFn, maybeFn) {
  const hasOptions = typeof optionsOrFn !== 'function';
  const options = hasOptions ? optionsOrFn ?? {} : {};
  const fn = hasOptions ? maybeFn : optionsOrFn;

  return test(
    name,
    liveSupabaseEnabled
      ? options
      : {
          ...options,
          skip: 'Set RUN_LIVE_SUPABASE_TESTS=1 to run live Supabase integration checks.',
        },
    fn
  );
}
