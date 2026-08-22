interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APPLE_TEAM_ID: string;
  ANDROID_SHA256_CERT_FINGERPRINT: string;
}

const BUNDLE_ID = "com.raecrutchfield.retail";
const ANDROID_PACKAGE = "com.raecrutchfield.retail";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/apple-app-site-association") {
      return json({
        applinks: {
          details: [
            {
              appIDs: [`${env.APPLE_TEAM_ID}.${BUNDLE_ID}`],
              components: [
                {
                  "/": "/listing/*",
                  comment: "Open public ReTail listings in the ReTail app."
                },
                {
                  "/": "/auth/callback",
                  comment: "Open ReTail auth callbacks in the app after email confirmation."
                }
              ]
            }
          ]
        }
      });
    }

    if (url.pathname === "/.well-known/assetlinks.json") {
      return json([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: ANDROID_PACKAGE,
            sha256_cert_fingerprints: [
              env.ANDROID_SHA256_CERT_FINGERPRINT
            ]
          }
        }
      ]);
    }

    if (url.pathname === "/auth/callback") {
      return html(authCallbackPage(url));
    }

    const match = url.pathname.match(/^\/listing\/([^/]+)\/?$/);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const listingId = decodeURIComponent(match[1]);

    if (!isPublicListingId(listingId)) {
      return html(unavailablePage(), 404);
    }

    try {
      const listing = await getListing(env, listingId);

      if (!listing || String(listing.status).toLowerCase() !== "active") {
        return html(unavailablePage(), 404);
      }

      return html(listingPage(listing, listingId));
    } catch (error) {
      console.error("Public listing lookup failed", {
        listingId,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      return html(unavailablePage(), 503);
    }
  }
};

async function getListing(env: Env, listingId: string) {
  const endpoint =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/rpc/get_public_listing_detail";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: supabasePublicHeaders(env.SUPABASE_ANON_KEY),
    body: JSON.stringify({
      target_listing_id: listingId
    })
  });

  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}`);
  }

  const rows = await response.json<any[]>();

  return Array.isArray(rows) && rows.length > 0
    ? rows[0]
    : null;
}

function supabasePublicHeaders(publicKey: string) {
  const headers: Record<string, string> = {
    apikey: publicKey,
    "Content-Type": "application/json"
  };

  if (publicKey.trim().startsWith("eyJ")) {
    headers.Authorization = `Bearer ${publicKey}`;
  }

  return headers;
}

function isPublicListingId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function listingPage(listing: any, listingId: string) {
  const title = escapeHtml(String(listing.title || "Pet supply listing"));
  const price = formatPrice(listing.price);

  const condition = listing.condition
    ? escapeHtml(String(listing.condition))
    : "";

  const location = [listing.city, listing.state]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(", ");

  const image =
    safeUrl(listing.thumbnail_url) ||
    safeUrl(listing.primary_image_url) ||
    firstImage(listing.images);

  const canonical =
    `https://retailpetapp.com/listing/${encodeURIComponent(listingId)}`;

  const description = [price, condition, location]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${title} on ReTail</title>

<meta name="description" content="${escapeAttr(
    description || "View this pet supply listing on ReTail."
  )}">

<link rel="canonical" href="${canonical}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="ReTail">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(
    description || "View this listing on ReTail."
  )}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${escapeAttr(image)}">` : ""}

<style>
*{box-sizing:border-box}
body{
margin:0;
padding:24px 16px;
background:#f8f3ea;
color:#1f2933;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
}
.card{
max-width:620px;
margin:auto;
background:white;
border-radius:20px;
padding:24px;
box-shadow:0 10px 35px rgba(31,41,51,.10)
}
.brand{
color:#285943;
font-size:28px;
font-weight:800;
margin-bottom:18px
}
.hero{
width:100%;
max-height:440px;
object-fit:cover;
border-radius:16px
}
h1{
font-size:28px;
margin:20px 0 8px
}
.meta{
font-weight:600;
color:#44524b
}
.copy{
line-height:1.6;
color:#59665f
}
.button{
display:inline-block;
background:#285943;
color:white;
padding:13px 18px;
border-radius:12px;
text-decoration:none;
font-weight:700;
margin-top:18px
}
</style>
</head>

<body>
<main class="card">
<div class="brand">ReTail</div>

${image
  ? `<img class="hero" src="${escapeAttr(image)}" alt="${escapeAttr(title)}">`
  : ""}

<h1>${title}</h1>

${description ? `<p class="meta">${description}</p>` : ""}

<p class="copy">
Buy and sell new or gently used pet supplies with people in your community.
</p>

<a class="button" href="${canonical}">
Open in ReTail
</a>

</main>
</body>
</html>`;
}

function unavailablePage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Listing unavailable | ReTail</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f3ea;padding:40px 20px;color:#1f2933">
<main style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px">
<h1 style="color:#285943">ReTail</h1>
<h2>This listing is no longer available.</h2>
<p>It may have sold, been removed, or no longer be public.</p>
<a href="https://retailpetapp.com">Visit ReTail</a>
</main>
</body>
</html>`;
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;

  for (const image of images) {
    if (!image || typeof image !== "object") continue;

    const row = image as Record<string, unknown>;

    const candidate =
      safeUrl(row.thumbnail_url) ||
      safeUrl(row.image_url);

    if (candidate) return candidate;
  }

  return null;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);

    return url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function formatPrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `$${value.toFixed(2)}`;
  }

  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? `$${numeric.toFixed(2)}`
    : value;
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function html(value: string, status = 200) {
  return new Response(value, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        status === 200
          ? "public, max-age=60, s-maxage=300"
          : "no-store"
    }
  });
}

function authCallbackPage(url: URL) {
  const appUrl = `retail://auth/callback${url.search}${url.hash}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Email confirmed | ReTail</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8faf6;color:#243126;display:grid;min-height:100vh;place-items:center;padding:24px}
main{max-width:480px;background:#fff;border:1px solid #dfe8d7;border-radius:16px;padding:28px;box-shadow:0 18px 48px rgba(34,49,38,.12)}
h1{font-size:1.7rem;margin:0 0 12px}
p{line-height:1.5;margin:0 0 18px}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;background:#2f6f4e;color:#fff;text-decoration:none;font-weight:700;padding:0 18px}
</style>
</head>
<body>
<main>
<h1>Email confirmed</h1>
<p>Your ReTail email is confirmed. Open ReTail to finish signing in.</p>
<a id="open-retail" href="${escapeHtml(appUrl)}">Open ReTail</a>
</main>
<script>
(function(){
  var target = ${JSON.stringify(appUrl)};
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, document.title, "/auth/callback");
  }
  setTimeout(function(){ window.location.href = target; }, 100);
})();
</script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char] || char
  );
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
