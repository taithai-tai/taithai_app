import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../site");
const routes = ["/", "/services/", "/how-it-works/", "/demo/", "/pricing/", "/about/", "/contact/", "/privacy/", "/thank-you/"];

const pages = routes.map((route) => {
  const file = route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
  assert.ok(fs.existsSync(file), `missing direct route file: ${route}`);
  return { route, file, html: fs.readFileSync(file, "utf8") };
});

const titles = [];
const descriptions = [];
for (const page of pages) {
  const title = page.html.match(/<title>([^<]+)<\/title>/i)?.[1];
  const description = page.html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
  assert.ok(title, `${page.route} has a title`);
  assert.ok(description, `${page.route} has a meta description`);
  titles.push(title);
  descriptions.push(description);
  assert.equal((page.html.match(/<h1(?:\s|>)/gi) || []).length, 1, `${page.route} has one H1`);
  assert.match(page.html, /<ace-header><\/ace-header>/, `${page.route} includes shared header`);
  assert.match(page.html, /<ace-footer(?:\s|>)/, `${page.route} includes shared footer`);
  assert.match(page.html, /เว็บไซต์นี้จัดทำขึ้นเพื่อวัตถุประสงค์ทางการศึกษาเท่านั้น/, `${page.route} includes Thai education notice fallback`);
  assert.match(page.html, /This website is created for educational purposes only\./, `${page.route} includes English education notice fallback`);
  assert.doesNotMatch(page.html, /href="#"/, `${page.route} has no empty important link`);

  const assetMatches = [...page.html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)[^\"]*"/g)];
  for (const match of assetMatches) {
    assert.ok(fs.existsSync(path.join(dist, match[1])), `${page.route} asset exists: ${match[1]}`);
  }

  const linkMatches = [...page.html.matchAll(/href="(\/[^\"]*)"/g)];
  for (const match of linkMatches) {
    const href = match[1];
    if (href.startsWith("/assets/")) continue;
    const clean = href.split(/[?#]/)[0];
    const target = clean === "/" ? path.join(dist, "index.html") : path.join(dist, clean.replace(/^\//, ""), "index.html");
    assert.ok(fs.existsSync(target), `${page.route} internal target exists: ${href}`);
  }
}

assert.equal(new Set(titles).size, titles.length, "page titles are unique");
assert.equal(new Set(descriptions).size, descriptions.length, "meta descriptions are unique");

const siteData = fs.readFileSync(path.join(dist, "assets/site-data.js"), "utf8");
assert.match(siteData, /เว็บไซต์นี้จัดทำขึ้นเพื่อวัตถุประสงค์ทางการศึกษาเท่านั้น/);
assert.match(siteData, /This website is created for educational purposes only\./);
assert.match(siteData, /LIVE_AI_MODE/);
const dataContext = { window: {} };
vm.runInNewContext(siteData, dataContext, { filename: "site-data.js" });
assert.equal(dataContext.window.ACE_DATA.services.length, 3, "central service data contains three services");
assert.equal(dataContext.window.ACE_DATA.packages.length, 3, "central package data contains three packages");
assert.equal(dataContext.window.ACE_DATA.faq.length, 5, "central FAQ data contains five required questions");
assert.equal(dataContext.window.ACE_DATA.pricingRows.length, 7, "central pricing comparison is complete");

const demoHtml = pages.find((page) => page.route === "/demo/").html;
assert.match(demoHtml, /โหมด AI จริง/);
assert.match(demoHtml, /ACE AI/);
assert.match(demoHtml, /บริการ AI ภายนอก/);
assert.doesNotMatch(demoHtml, /9arm|qwen3|นายอา?ร์?ม/i);
assert.match(demoHtml, /ไม่แสดงผลจำลองแทน/);
assert.match(demoHtml, /จัดแผนงานวันนี้/);
assert.match(demoHtml, /ดูตัวอย่างสรุปข้อมูล/);
assert.match(demoHtml, /ช่วยร่างข้อความ/);
assert.match(pages.find((page) => page.route === "/").html, /data-render="service-cards"/);
assert.match(pages.find((page) => page.route === "/services/").html, /data-render="service-details"/);
assert.match(pages.find((page) => page.route === "/pricing/").html, /data-render="pricing-table"/);

const contactHtml = pages.find((page) => page.route === "/contact/").html;
assert.match(contactHtml, /ข้อมูลที่กรอกยังไม่ถูกส่ง/);
assert.match(contactHtml, /สร้างสรุปคำขอ/);
assert.doesNotMatch(contactHtml, /ส่งสำเร็จ/);
assert.doesNotMatch(contactHtml, /<(?:input|select|textarea)[^>]+name="/, "contact fields cannot leak through a no-JS GET submit");
assert.match(contactHtml, /id="contact-submit"[^>]+disabled/, "contact submit starts disabled until handlers are ready");

assert.doesNotMatch(demoHtml, /<(?:input|select|textarea)[^>]+name="/, "demo fields cannot leak through a no-JS GET submit");
assert.equal((demoHtml.match(/type="submit" disabled/g) || []).length, 3, "all demo submits start disabled until handlers are ready");

assert.match(pages.find((page) => page.route === "/services/").html, /contact\/\?service=life-planner/);
assert.match(pages.find((page) => page.route === "/pricing/").html, /contact\/\?package=starter/);

for (const file of ["site-data.js", "site.js", "demo-engine.js", "ai-client.js", "demo.js", "contact.js"]) {
  const code = fs.readFileSync(path.join(dist, "assets", file), "utf8");
  new vm.Script(code, { filename: file });
}

const workerSource = fs.readFileSync(path.resolve(here, "../worker/index.template.js"), "utf8");
assert.match(workerSource, /env\.NINEARM_API_KEY/);
assert.match(workerSource, /\/chat\/completions/);
assert.match(workerSource, /REQUEST_LIMIT/);
assert.doesNotMatch(workerSource, /sk-[A-Za-z0-9_-]{12,}/, "API key must never be committed to Worker source");

console.log(`static validation: ${pages.length} routes, unique metadata, links, assets, disclaimers and scripts passed`);
