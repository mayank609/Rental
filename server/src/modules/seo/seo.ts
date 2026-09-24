/**
 * SEO: sitemap.xml, robots.txt and server-side meta/JSON-LD injection for
 * public pages (/rent/..., /listing/...). When the API also serves the SPA
 * build (SERVE_CLIENT_DIR) crawlers receive fully-populated <head> tags and
 * a text snapshot; otherwise the /seo/render endpoint can be used by an
 * edge function / prerender proxy in front of the static frontend.
 */
import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { cached } from "../../lib/cache";
import { formatMoney } from "../../lib/util";

export const seoRouter = Router();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

seoRouter.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /admin
Disallow: /checkout
Disallow: /api/
Sitemap: ${env.APP_URL}/sitemap.xml
`);
});

seoRouter.get("/sitemap.xml", async (_req, res) => {
  const xml = await cached("seo", "sitemap", 3600, async () => {
    const [cities, categories, listings, localities] = await Promise.all([
      prisma.city.findMany({ where: { isActive: true, listingCount: { gt: 0 } }, select: { slug: true, updatedAt: true } }),
      prisma.category.findMany({ where: { isActive: true }, select: { slug: true, id: true } }),
      prisma.listing.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, slug: true, updatedAt: true }, take: 45000, orderBy: { updatedAt: "desc" } }),
      prisma.locality.findMany({ where: { listingCount: { gt: 0 } }, select: { slug: true, city: { select: { slug: true } } }, take: 2000 }),
    ]);
    // Only emit category/city combinations that actually have listings
    const combos = await prisma.$queryRaw<{ cat: string; city: string }[]>`
      SELECT DISTINCT cat.slug AS cat, c.slug AS city FROM "Listing" l
      JOIN "Category" cat ON cat.id = l."categoryId" JOIN "City" c ON c.id = l."cityId"
      WHERE l."status" = 'ACTIVE' AND l."deletedAt" IS NULL`;
    const urls: { loc: string; lastmod?: Date; priority: string }[] = [
      { loc: `${env.APP_URL}/`, priority: "1.0" },
      { loc: `${env.APP_URL}/cities`, priority: "0.6" },
      ...cities.map((c) => ({ loc: `${env.APP_URL}/rent/${c.slug}`, lastmod: c.updatedAt, priority: "0.9" })),
      ...combos.map((c) => ({ loc: `${env.APP_URL}/rent/${c.cat}/${c.city}`, priority: "0.8" })),
      ...localities.map((l) => ({ loc: `${env.APP_URL}/rent/all/${l.city.slug}/${l.slug}`, priority: "0.6" })),
      ...listings.map((l) => ({ loc: `${env.APP_URL}/listing/${l.id}/${l.slug}`, lastmod: l.updatedAt, priority: "0.7" })),
      ...["terms", "privacy", "refund-policy", "rental-agreement", "how-it-works", "trust-and-safety"].map((p) => ({ loc: `${env.APP_URL}/${p}`, priority: "0.3" })),
    ];
    void categories;
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
  });
  res.type("application/xml").send(xml);
});

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  jsonLd?: object[];
  bodyHtml?: string;
  status?: number;
}

const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Build meta tags for a public SPA route. */
export async function metaForPath(pathname: string): Promise<PageMeta> {
  const base: PageMeta = {
    title: `${env.PLATFORM_NAME} — Rent anything near you`,
    description: `Rent cameras, electronics, furniture, tools, bikes and more from people in your neighbourhood. Verified owners, secure payments and deposit protection.`,
    canonical: `${env.APP_URL}${pathname}`,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Organization", name: env.PLATFORM_NAME, url: env.APP_URL, email: env.SUPPORT_EMAIL },
      { "@context": "https://schema.org", "@type": "WebSite", name: env.PLATFORM_NAME, url: env.APP_URL, potentialAction: { "@type": "SearchAction", target: `${env.APP_URL}/search?q={query}`, "query-input": "required name=query" } },
    ],
  };

  const listingMatch = pathname.match(/^\/listing\/([^/]+)/);
  if (listingMatch) {
    const l = await prisma.listing.findFirst({
      where: { id: listingMatch[1], status: "ACTIVE", deletedAt: null },
      include: { images: { orderBy: { sortOrder: "asc" }, take: 5 }, city: true, locality: true, category: true, owner: true },
    });
    if (!l) return { ...base, title: `Listing not found — ${env.PLATFORM_NAME}`, status: 404 };
    const price = l.priceDaily ?? (l.priceHourly ? l.priceHourly * 24 : 0);
    const where = [l.locality?.name, l.city.name].filter(Boolean).join(", ");
    return {
      title: `Rent ${l.title} in ${where} — ${formatMoney(price)}/day | ${env.PLATFORM_NAME}`,
      description: `${l.description.slice(0, 150)}… Rent from a verified owner in ${where}.`,
      canonical: `${env.APP_URL}/listing/${l.id}/${l.slug}`,
      image: l.images[0]?.url,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: l.title,
          description: l.description.slice(0, 500),
          image: l.images.map((i) => i.url),
          category: l.category.name,
          ...(l.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: l.ratingAvg.toFixed(1), reviewCount: l.ratingCount } } : {}),
          offers: {
            "@type": "Offer",
            priceCurrency: env.CURRENCY,
            price: (price / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
            areaServed: where,
            url: `${env.APP_URL}/listing/${l.id}/${l.slug}`,
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: env.APP_URL },
            { "@type": "ListItem", position: 2, name: l.city.name, item: `${env.APP_URL}/rent/${l.city.slug}` },
            { "@type": "ListItem", position: 3, name: l.category.name, item: `${env.APP_URL}/rent/${l.category.slug}/${l.city.slug}` },
            { "@type": "ListItem", position: 4, name: l.title },
          ],
        },
      ],
      bodyHtml: `<article><h1>${esc(l.title)}</h1><p>${esc(where)} · ${esc(formatMoney(price))}/day · Deposit ${esc(formatMoney(l.securityDeposit))}</p><p>${esc(l.description)}</p></article>`,
    };
  }

  const rentMatch = pathname.match(/^\/rent\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
  if (rentMatch) {
    const [, a, b, c] = rentMatch;
    const citySlug = b ? b : a;
    const catSlug = b ? (a === "all" ? null : a) : null;
    const localitySlug = c ?? null;
    const [city, cat] = await Promise.all([
      prisma.city.findUnique({ where: { slug: citySlug } }),
      catSlug ? prisma.category.findUnique({ where: { slug: catSlug } }) : null,
    ]);
    const locality = city && localitySlug ? await prisma.locality.findUnique({ where: { cityId_slug: { cityId: city.id, slug: localitySlug } } }) : null;
    const cityName = city?.name ?? titleCase(citySlug);
    const where = locality ? `${locality.name}, ${cityName}` : cityName;
    const what = cat ? cat.name : "items";
    const listings = city
      ? await prisma.listing.findMany({
          where: { cityId: city.id, status: "ACTIVE", deletedAt: null, ...(cat ? { OR: [{ categoryId: cat.id }, { subcategoryId: cat.id }] } : {}), ...(locality ? { localityId: locality.id } : {}) },
          take: 20,
          orderBy: [{ featuredUntil: { sort: "desc", nulls: "last" } }, { ratingAvg: "desc" }],
          select: { id: true, slug: true, title: true, priceDaily: true, priceHourly: true },
        })
      : [];
    return {
      title: `Rent ${what} in ${where} | ${env.PLATFORM_NAME}`,
      description: `Browse ${city?.listingCount ?? "local"} ${what.toLowerCase()} for rent in ${where}. Pay securely, pick up nearby, deposit protected.`,
      canonical: `${env.APP_URL}${pathname.replace(/\/$/, "")}`,
      status: city ? 200 : 404,
      jsonLd: [
        ...(base.jsonLd ?? []),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${what} for rent in ${where}`,
          itemListElement: listings.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: `${env.APP_URL}/listing/${l.id}/${l.slug}`, name: l.title })),
        },
      ],
      bodyHtml: `<h1>Rent ${esc(what)} in ${esc(where)}</h1><ul>${listings.map((l) => `<li><a href="/listing/${l.id}/${esc(l.slug)}">${esc(l.title)}</a> — ${esc(formatMoney(l.priceDaily ?? (l.priceHourly ?? 0) * 24))}/day</li>`).join("")}</ul>`,
    };
  }
  return base;
}

export function renderHead(m: PageMeta) {
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(env.PLATFORM_NAME)}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.canonical)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : "",
    `<meta name="twitter:card" content="${m.image ? "summary_large_image" : "summary"}">`,
    ...(m.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ].join("\n    ");
}

/** JSON meta for edge prerenderers / the SPA. */
seoRouter.get("/api/v1/seo/meta", async (req, res) => {
  const p = String(req.query.path ?? "/");
  res.json(await metaForPath(p.startsWith("/") ? p : `/${p}`));
});

/** Serve the SPA with injected meta tags (single-service deployments). */
export function spaWithSeo(clientDir: string) {
  const indexPath = path.join(clientDir, "index.html");
  let template = "";
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/") || path.extname(req.path)) return next();
    try {
      template ||= fs.readFileSync(indexPath, "utf8");
      const isPublic = /^\/(rent|listing)\//.test(req.path) || req.path === "/";
      const meta = isPublic ? await metaForPath(req.path) : null;
      let html = template;
      if (meta) {
        html = html.replace(/<title>.*?<\/title>/s, "").replace("</head>", `    ${renderHead(meta)}\n  </head>`);
        if (meta.bodyHtml) html = html.replace('<div id="root"></div>', `<div id="root"></div><noscript>${meta.bodyHtml}</noscript>`);
      }
      res.status(meta?.status ?? 200).type("html").send(html);
    } catch (err) {
      next(err);
    }
  };
}
