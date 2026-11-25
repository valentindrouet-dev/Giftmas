// Récupère l'image (og:image) et le titre d'une page produit, pour pré-remplir un cadeau.
// Beaucoup de sites (Amazon surtout) bloquent ce genre de requête : l'app propose alors une photo.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { url } = await req.json();
    const u = new URL(url);
    if (u.protocol !== "https:") return json({});
    const res = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", "Accept-Language": "fr-FR" },
      signal: AbortSignal.timeout(6000),
    });
    const html = (await res.text()).slice(0, 500_000);
    const image = meta(html, "og:image");
    const title = meta(html, "og:title");
    return json({ image: image?.startsWith("https://") ? image : undefined, title: title?.slice(0, 120) });
  } catch {
    return json({});
  }
});
