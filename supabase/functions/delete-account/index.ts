import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type DeleteAccountResponse = {
  deleted: boolean;
  authDeleted: boolean;
  status: 'deleted' | 'already_deleted';
  storageCleanup: {
    avatarsRemoved: number;
    listingImagesRemoved: number;
    messageImagesRetained: true;
  };
};

type SafeErrorResponse = {
  deleted: false;
  authDeleted: false;
  code: string;
  message: string;
  retryable: boolean;
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function jsonResponse(body: DeleteAccountResponse | SafeErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function safeError(status: number, code: string, message: string, retryable: boolean): Response {
  return jsonResponse({ deleted: false, authDeleted: false, code, message, retryable }, status);
}

function requiredEnv(name: string, fallbackName?: string): string {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createUserClient(supabaseUrl: string, anonKey: string, authorization: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
}

function createAdminClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function listStoragePaths(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw new Error(`STORAGE_LIST_FAILED:${bucket}`);
  }

  const paths: string[] = [];

  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;

    if (item.id) {
      paths.push(path);
      continue;
    }

    paths.push(...await listStoragePaths(supabaseAdmin, bucket, path));
  }

  return paths;
}

async function removeStoragePaths(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<number> {
  let removed = 0;

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);

    if (chunk.length === 0) {
      continue;
    }

    const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);

    if (error) {
      throw new Error(`STORAGE_REMOVE_FAILED:${bucket}`);
    }

    removed += chunk.length;
  }

  return removed;
}

async function cleanupDisposableStorage(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<DeleteAccountResponse['storageCleanup']> {
  const avatarPaths = await listStoragePaths(supabaseAdmin, 'avatars', userId);
  const listingImagePaths = await listStoragePaths(supabaseAdmin, 'listings', userId);

  return {
    avatarsRemoved: await removeStoragePaths(supabaseAdmin, 'avatars', avatarPaths),
    listingImagesRemoved: await removeStoragePaths(supabaseAdmin, 'listings', listingImagePaths),
    messageImagesRetained: true,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return safeError(405, 'METHOD_NOT_ALLOWED', 'Use POST to delete an account.', false);
  }

  const authorization = request.headers.get('Authorization') ?? '';

  if (!authorization.startsWith('Bearer ')) {
    return safeError(401, 'AUTH_REQUIRED', 'Sign in again before deleting your account.', true);
  }

  let supabaseUrl: string;
  let anonKey: string;
  let serviceRoleKey: string;

  try {
    supabaseUrl = requiredEnv('SUPABASE_URL');
    anonKey = requiredEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  } catch {
    return safeError(500, 'SERVER_NOT_CONFIGURED', 'Account deletion is not configured yet.', false);
  }

  const userClient = createUserClient(supabaseUrl, anonKey, authorization);
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const user = userResult.user;

  if (userError || !user) {
    return safeError(401, 'AUTH_SESSION_INVALID', 'Sign in again before deleting your account.', true);
  }

  const preparation = await userClient.rpc('prepare_current_account_deletion');

  if (preparation.error) {
    return safeError(
      503,
      'ACCOUNT_DELETION_PREPARATION_FAILED',
      'We could not finish deleting your account. Please try again.',
      true
    );
  }

  const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey);
  let storageCleanup: DeleteAccountResponse['storageCleanup'];

  try {
    storageCleanup = await cleanupDisposableStorage(supabaseAdmin, user.id);
  } catch {
    return safeError(
      503,
      'ACCOUNT_DELETION_STORAGE_INCOMPLETE',
      'We could not finish deleting your account. Please try again.',
      true
    );
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id, true);

  if (deleteError) {
    if (/not found|already/i.test(deleteError.message)) {
      return jsonResponse({
        deleted: true,
        authDeleted: true,
        status: 'already_deleted',
        storageCleanup,
      });
    }

    return safeError(
      503,
      'ACCOUNT_DELETION_AUTH_INCOMPLETE',
      'We could not finish deleting your account. Please try again.',
      true
    );
  }

  return jsonResponse({
    deleted: true,
    authDeleted: true,
    status: 'deleted',
    storageCleanup,
  });
});
