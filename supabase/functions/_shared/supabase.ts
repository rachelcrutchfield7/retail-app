import { createClient } from 'npm:@supabase/supabase-js@2';

type AuthenticatedRequest = {
  supabaseAdmin: ReturnType<typeof createClient>;
  user: {
    id: string;
    email?: string;
  };
};

function readSecretKey(): string {
  const explicitKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (explicitKey) {
    return explicitKey;
  }

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');

  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string | undefined>;
    const key = parsed.service_role ?? parsed.default;

    if (key) {
      return key;
    }
  }

  throw new Error('Missing Supabase service-role key for Stripe function.');
}

export function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL for Stripe function.');
  }

  return createClient(supabaseUrl, readSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthenticatedRequest(request: Request): Promise<AuthenticatedRequest> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw Object.assign(new Error('Missing Authorization bearer token.'), { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw Object.assign(new Error('Invalid Supabase session.'), { status: 401 });
  }

  return {
    supabaseAdmin,
    user: {
      id: data.user.id,
      email: data.user.email ?? undefined,
    },
  };
}
