/** Build a self-contained browser-only demo without copying anyone's real workspace. */
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";

const root = process.cwd();
const temporaryDatabase = mkdtempSync(resolve(tmpdir(), "momentum-preview-"));
process.env.DATA_DIR = temporaryDatabase;
const { db, id, createWorkspace, ensureDailyPlan } =
  await import("../server/db.ts");
const { configs, foreignKeys } = await import("../server/validation.ts");
const demoUser = id();
createWorkspace(
  demoUser,
  "preview@momentum.local",
  "not-a-real-password",
  "Chisom Ogbonna",
);
ensureDailyPlan(demoUser);
const resources = Object.keys(configs) as Array<keyof typeof configs>;
const seed: Record<string, unknown> = {
  settings: db.prepare("SELECT * FROM settings WHERE user_id=?").get(demoUser),
};
const defaults: Record<string, Record<string, unknown>> = {};
const required: Record<string, string[]> = {};
for (const resource of resources) {
  seed[resource] = db
    .prepare(`SELECT * FROM ${resource} WHERE user_id=?`)
    .all(demoUser);
  required[resource] = configs[resource].required;
  defaults[resource] = {};
  const columns = db.prepare(`PRAGMA table_info(${resource})`).all() as Array<{
    name: string;
    dflt_value: string | null;
  }>;
  for (const { name, dflt_value: value } of columns) {
    if (["id", "user_id", "created_at", "updated_at"].includes(name)) continue;
    if (value === null) defaults[resource][name] = null;
    else if (value.startsWith("'") && value.endsWith("'"))
      defaults[resource][name] = value.slice(1, -1).replaceAll("''", "'");
    else if (Number.isFinite(Number(value)))
      defaults[resource][name] = Number(value);
    else defaults[resource][name] = null;
  }
}
db.close();
rmSync(temporaryDatabase, { recursive: true, force: true });
const safeJSON = (value: unknown) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");
let adapter = readFileSync(resolve(root, "scripts/preview-api.js"), "utf8")
  .replace("__PREVIEW_SEED__", safeJSON(seed))
  .replace("__PREVIEW_DEFAULTS__", safeJSON(defaults))
  .replace("__PREVIEW_REQUIRED__", safeJSON(required))
  .replace("__PREVIEW_REFERENCES__", safeJSON(foreignKeys));
adapter = adapter.replace(/<\/script/gi, "<\\/script");
const builtHtml = readFileSync(resolve(root, "dist/index.html"), "utf8");
const scriptMatch = builtHtml.match(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
);
const cssMatch = builtHtml.match(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
);
if (!scriptMatch || !cssMatch)
  throw new Error(
    "Expected Vite's built JavaScript and stylesheet in dist/index.html. Run npm run build first.",
  );
const asset = (url: string) => resolve(root, "dist", url.replace(/^\//, ""));
const javascript = readFileSync(asset(scriptMatch[1]), "utf8")
  // Keep literal script tags inside React's bundled strings inert in HTML previewers.
  .replace(/<script/gi, "\\x3cscript")
  .replace(/<\/script/gi, "<\\/script");
let css = readFileSync(asset(cssMatch[1]), "utf8");
css = css.replace(
  /url\((['"]?)(\/assets\/[^)'"?#]+)\1\)/g,
  (_whole, _quote, url: string) => {
    const extension = extname(url).toLowerCase();
    const mime =
      extension === ".woff2"
        ? "font/woff2"
        : extension === ".woff"
          ? "font/woff"
          : "application/octet-stream";
    return `url(data:${mime};base64,${readFileSync(asset(url)).toString("base64")})`;
  },
);
if (/url\((['"]?)\/assets\//.test(css))
  throw new Error("An asset URL was not embedded into the standalone preview.");
const bannerStyles = `
#demo-notice{position:fixed;z-index:10000;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100vw - 24px);display:flex;gap:8px;align-items:center;padding:8px 12px;background:#263c70;color:#fff;border:1px solid #6689de;border-radius:8px;box-shadow:0 5px 22px #0008;font:500 12px/1.4 Inter,system-ui,sans-serif}
#demo-notice strong{white-space:nowrap}#demo-notice button{border:0;background:transparent;color:#fff;font-size:17px;cursor:pointer;line-height:1}
@media(max-width:600px){#demo-notice{width:calc(100% - 24px);font-size:11px;justify-content:center}}
`;
let html = builtHtml
  .replace(
    scriptMatch[0],
    () =>
      `<script>${adapter}</script>\n<script type="module">${javascript}</script>`,
  )
  .replace(cssMatch[0], () => `<style>${css}\n${bannerStyles}</style>`)
  .replace(
    "</body>",
    `<div id="demo-notice" role="status"><strong>Preview only</strong><span>Changes stay in this browser and are not synced or private.</span><button type="button" aria-label="Dismiss preview notice" onclick="this.parentElement.remove()">×</button></div>\n</body>`,
  );
mkdirSync(resolve(root, "preview-dist"), { recursive: true });
writeFileSync(resolve(root, "preview-dist/index.html"), html);
console.log(
  `Standalone preview written to preview-dist/index.html (${Math.round(Buffer.byteLength(html) / 1024)} KB).`,
);
