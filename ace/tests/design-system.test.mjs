import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/server/index.js";

// Source and Worker tests, NOT browser rendering or live-provider tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["", "services", "how-it-works", "demo", "pricing", "about", "contact", "privacy", "thank-you"];
const voidTags = new Set(["meta", "link", "img", "input", "br", "hr", "area", "base", "embed", "source", "wbr"]);
for (const page of pages) {
  const source = fs.readFileSync(path.join(root, "site", page, "index.html"), "utf8");
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, page + ": duplicate ID");
  for (const [, id] of source.matchAll(/<label[^>]*\bfor="([^"]+)"/g)) {
    assert.ok(ids.includes(id), page + ": label target missing: " + id);
  }
  const stack = [];
  for (const match of source.matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*>/gi)) {
    const [, closing, rawTag] = match;
    const tag = rawTag.toLowerCase();
    if (voidTags.has(tag) || /\/>$/.test(match[0])) continue;
    if (closing) assert.equal(stack.pop(), tag, page + ": malformed HTML near " + match[0]);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], page + ": unclosed HTML");
  const urls = page ? ["/" + page, "/" + page + "/"] : ["/"];
  for (const url of urls) {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const response = await worker.fetch(new Request("https://ace.test" + url), {});
      assert.equal(response.status, 200);
      assert.equal(await response.text(), source);
    }
  }
}
const asset = await worker.fetch(new Request("https://ace.test/assets/ace-loop.webp"), {});
assert.equal(asset.status, 200);
assert.equal(asset.headers.get("content-type"), "image/webp");
assert.ok((await asset.arrayBuffer()).byteLength < 100000);
const css = fs.readFileSync(path.join(root, "site/assets/styles.css"), "utf8");
assert.ok(css.includes('prefers-reduced-motion:reduce'));
assert.ok(css.includes('data-reduce-effects="true"'));
assert.ok(css.includes("minmax(0,2fr) minmax(0,3fr)"));
assert.ok(css.includes("content:attr(data-label)"));
assert.ok(!css.includes("--accent:#4f46e5"));
assert.ok(!css.includes("max-height:410px"), "No nested scrolling source box");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
const shared = fs.readFileSync(path.join(root, "site/assets/site.js"), "utf8");
assert.ok(shared.includes("element.inert = true"));
assert.ok(shared.includes("element.inert = false"));
assert.ok(shared.includes('localStorage.setItem("ace-reduce-effects"'));
const privacy = fs.readFileSync(path.join(root, "site/privacy/index.html"), "utf8");
assert.ok(privacy.includes("ลดเอฟเฟกต์"));

function luminance(hex) {
  return hex.match(/\w\w/g).map((pair) => parseInt(pair, 16) / 255)
    .map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
}
const samples = [
  ["626a77", "ffffff"], ["626a77", "f7f8fa"], ["4b5666", "d1d1d1"],
  ["1d4ed8", "edf3ff"], ["765014", "faf5e9"], ["176044", "e5f7ef"], ["a32920", "fff2f0"]
];
// The nav sample conservatively composites 82% white over a fully black backdrop.
const ratios = samples.map(([a, b]) => {
  const x = luminance(a), y = luminance(b);
  const ratio = (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  assert.ok(ratio >= 4.5, a + "/" + b + ": " + ratio);
  return ratio.toFixed(2);
});
console.log("UI source checks: 9 HTML trees, labels/IDs, 17 direct Worker URLs twice, image MIME/size, reduced-effects contract passed");
console.log("Calculated contrast (not rendered-browser contrast): " + ratios.join(", "));
