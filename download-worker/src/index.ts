const PAGES_ORIGIN = "https://retail-prelaunch.pages.dev";
const PRIMARY_HOST = "www.retailpetapp.com";
const STATIC_ASSET_PREFIX = "/retail-site-static";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "retailpetapp.com") {
      url.hostname = PRIMARY_HOST;
      url.pathname = "/download/";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname === "/download") {
      url.pathname = "/download/";
      return Response.redirect(url.toString(), 308);
    }

    const upstreamUrl = new URL(url.pathname + url.search, PAGES_ORIGIN);
    const upstreamResponse = await fetch(new Request(upstreamUrl, request));
    const headers = new Headers(upstreamResponse.headers);

    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("x-robots-tag");
    headers.set("X-Content-Type-Options", "nosniff");

    if (!headers.get("content-type")?.includes("text/html")) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers
      });
    }

    const body = (await upstreamResponse.text())
      .replaceAll('href="/_astro/', `href="${STATIC_ASSET_PREFIX}/_astro/`)
      .replaceAll('src="/_astro/', `src="${STATIC_ASSET_PREFIX}/_astro/`);

    return new Response(body, {
      status: upstreamResponse.status,
      headers
    });
  }
};
