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

type JwtClaims = {
  sub?: unknown;
  amr?: unknown;
};

type AuthMethodReference = {
  method?: unknown;
  timestamp?: unknown;
};

const recentAuthWindowSeconds = 10 * 60;
const recentAuthClockSkewSeconds = 60;
const recentAuthMethods = new Set([
  'magiclink',
  'oauth',
  'otp',
  'password',
  'recovery',
  'sso/saml',
  'totp',
]);

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

function bearerTokenFromAuthorization(authorization: string): string | null {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function decodeJwtClaims(accessToken: string): JwtClaims | null {
  const payload = accessToken.split('.')[1];

  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(decodeBase64Url(payload));

    return typeof claims === 'object' && claims !== null ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

function authMethodTimestampSeconds(entry: AuthMethodReference): number | null {
  if (typeof entry.method !== 'string' || !recentAuthMethods.has(entry.method)) {
    return null;
  }

  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) {
    return null;
  }

  return Math.floor(entry.timestamp);
}

function latestTrustedAuthTimestampSeconds(amr: unknown): number | null {
  if (!Array.isArray(amr)) {
    return null;
  }

  let latestTimestamp: number | null = null;

  for (const entry of amr) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const timestamp = authMethodTimestampSeconds(entry as AuthMethodReference);

    if (timestamp === null) {
      continue;
    }

    latestTimestamp = latestTimestamp === null ? timestamp : Math.max(latestTimestamp, timestamp);
  }

  return latestTimestamp;
}

function hasRecentAuthentication(accessToken: string, userId: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const claims = decodeJwtClaims(accessToken);

  if (!claims || claims.sub !== userId) {
    return false;
  }

  const authTimestamp = latestTrustedAuthTimestampSeconds(claims.amr);

  if (authTimestamp === null || authTimestamp > nowSeconds + recentAuthClockSkewSeconds) {
    return false;
  }

  return nowSeconds - authTimestamp <= recentAuthWindowSeconds;
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
  const accessToken = bearerTokenFromAuthorization(authorization);

  if (!accessToken) {
    return safeError(401, 'AUTH_REQUIRED', 'Sign in again before deleting your account.', true);
  }

  let supabaseUrl: string;
  let anonKey: string;

  try {
    supabaseUrl = requiredEnv('SUPABASE_URL');
    anonKey = requiredEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
  } catch {
    return safeError(500, 'SERVER_NOT_CONFIGURED', 'Account deletion is not configured yet.', false);
  }

  const userClient = createUserClient(supabaseUrl, anonKey, authorization);
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const user = userResult.user;

  if (userError || !user) {
    return safeError(401, 'AUTH_SESSION_INVALID', 'Sign in again before deleting your account.', true);
  }

  if (!hasRecentAuthentication(accessToken, user.id)) {
    return safeError(
      401,
      'RECENT_AUTH_REQUIRED',
      'For security, please sign in again before deleting your account.',
      true
    );
  }

  let serviceRoleKey: string;

  try {
    serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  } catch {
    return safeError(500, 'SERVER_NOT_CONFIGURED', 'Account deletion is not configured yet.', false);
  }

  const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey);
  const preparation = await supabaseAdmin.rpc('prepare_account_deletion_for_user', {
    target_user_id: user.id,
  });

  if (preparation.error) {
    return safeError(
      503,
      'ACCOUNT_DELETION_PREPARATION_FAILED',
      'We could not finish deleting your account. Please try again.',
      true
    );
  }

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
