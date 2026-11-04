// 画面で使っている線アイコン（data-icon など）には、どれも形があるか（名前をまちがえると、アイコンが空白になる）
//   形は Q キット（q-oqrn の shared/icons/）か、このツールの CSS の .ls-icon[data-icon="…"]
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Q キットの線アイコンの置き場（となりの q-oqrn。作業用のフォルダでは、ひとつ上の q-oqrn）
const KIT = [join(ROOT, "..", "q-oqrn", "shared", "icons"), join(ROOT, "..", "..", "q-oqrn", "shared", "icons")].find((d) => existsSync(d));

// このツールのファイル（test・tools・.git などは見ない）
function files(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    if ([".git", "node_modules", "test", "tools", "docs"].includes(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(html|js|css)$/.test(name) ? [p] : [];
  });
}

test("使っている線アイコンには、どれも形がある（Q キットか、このツールの CSS）", { skip: !KIT && "Q キット（q-oqrn）が見つからない" }, () => {
  const kit = new Set(readdirSync(KIT).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)));
  const texts = files().map((p) => readFileSync(p, "utf8"));
  const local = new Set(texts.flatMap((t) => [...t.matchAll(/\.ls-icon\[data-icon="([a-z0-9-]+)"\]\s*\{\s*--ls-i:/g)].map((m) => m[1])));
  const used = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/(?:data-icon="|(?:lineIcon|icon)\(\s*"|icon: ")([a-z][a-z0-9-]*)"/g)) used.add(m[1]);
    // lineIcon(x ? "a" : "b") の形
    for (const m of t.matchAll(/(?:lineIcon|icon)\([^)"]*\?\s*"([a-z][a-z0-9-]*)"\s*:\s*"([a-z][a-z0-9-]*)"/g)) used.add(m[1]).add(m[2]);
  }
  assert.ok(used.size > 0, "線アイコンが1つも見つからない");
  const missing = [...used].filter((n) => !kit.has(n) && !local.has(n));
  assert.deepEqual(missing, [], `形のない線アイコン：${missing.join("・")}`);
});
