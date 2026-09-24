import { Helmet } from "react-helmet-async";
import { PLATFORM_NAME } from "./layout/Header";

/** Per-page <head> tags (client-side; the server injects the same for crawlers). */
export function Seo({ title, description, image, canonical, jsonLd, noindex }: { title: string; description?: string; image?: string; canonical?: string; jsonLd?: object | object[]; noindex?: boolean }) {
  const full = title.includes(PLATFORM_NAME) ? title : `${title} | ${PLATFORM_NAME}`;
  const url = canonical ?? (typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined);
  return (
    <Helmet>
      <title>{full}</title>
      {description && <meta name="description" content={description} />}
      {url && <link rel="canonical" href={url} />}
      <meta property="og:title" content={full} />
      {description && <meta property="og:description" content={description} />}
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
