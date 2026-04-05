import Stripe from "stripe";

async function getCredentials() {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : null;
  if (!xReplitToken || !hostname) throw new Error("Missing Replit env vars");

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", "development");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = await res.json() as { items: any[] };
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret) throw new Error("Stripe credentials not found");
  return settings.secret as string;
}

async function createProducts() {
  const secretKey = await getCredentials();
  const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });

  console.log("Checking for existing Pro Plan...");
  const existing = await stripe.products.search({ query: "name:'ERROR707 Pro' AND active:'true'" });

  if (existing.data.length > 0) {
    console.log("ERROR707 Pro already exists:", existing.data[0].id);
    const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
    prices.data.forEach(p => console.log(`  Price: ${p.id} — ${p.unit_amount} ${p.currency}/${(p.recurring as any)?.interval}`));
    return;
  }

  const product = await stripe.products.create({
    name: "ERROR707 Pro",
    description: "Descargas ilimitadas, sin marca de agua, sin restricciones de cantidad.",
    metadata: { plan: "pro" },
  });
  console.log("Created product:", product.id);

  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 16900,
    currency: "mxn",
    recurring: { interval: "month" },
    nickname: "Pro Mensual",
  });
  console.log("Created monthly price:", monthly.id, "— $169 MXN/mes");

  const yearly = await stripe.prices.create({
    product: product.id,
    unit_amount: 169000,
    currency: "mxn",
    recurring: { interval: "year" },
    nickname: "Pro Anual",
  });
  console.log("Created yearly price:", yearly.id, "— $1,690 MXN/año");

  console.log("Done! Webhooks will sync to DB automatically.");
}

createProducts().catch(e => { console.error(e); process.exit(1); });
