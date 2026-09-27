/**
 * Inlines the interactive film into self-contained HTML (no external
 * requests; images & music as data URIs):
 *   out/rentnest-interactive.html  – full document for hosting / playable ads
 *   interactive/artifact.html      – body fragment for Claude Artifact publishing
 *   node marketing/scripts/build-interactive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p));
const dataUri = (file, mime) => `data:${mime};base64,${read(file).toString("base64")}`;

let html = read("interactive/template.html").toString("utf8");
html = html.replace("/*SHARED_CSS*/", read("promo/shared.css").toString("utf8"));
html = html.replace("/*SHARED_JS*/", read("promo/shared.js").toString("utf8"));
html = html.replace(/\{\{IMG:([\w.-]+)\}\}/g, (_, f) => dataUri(`assets/${f}`, "image/jpeg"));
html = html.replace("{{AUDIO}}", dataUri("assets/music-loop.m4a", "audio/mp4"));

fs.writeFileSync(path.join(ROOT, "interactive/artifact.html"), html);
const full = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta property="og:title" content="RentNest · Rent or Earn" />
<meta property="og:description" content="Rent anything near you, or see what your idle stuff could earn." />
${html.replace(/<main/, "</head>\n<body>\n<main")}
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out/rentnest-interactive.html"), full);
console.log(`✓ interactive: ${(Buffer.byteLength(full) / 1e6).toFixed(2)} MB`);
