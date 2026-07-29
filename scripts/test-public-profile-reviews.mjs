import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const firebaseAuth = await readFile(new URL("../firebase-auth.js", import.meta.url), "utf8");
const account = await readFile(new URL("../Movie Memory/account.js", import.meta.url), "utf8");
const profile = await readFile(new URL("../Movie Memory/profile.html", import.meta.url), "utf8");

const publishStart = firebaseAuth.indexOf("export async function publishMovieCollection");
assert.notEqual(publishStart, -1, "publishMovieCollection must exist");
const publishSource = firebaseAuth.slice(publishStart, firebaseAuth.indexOf("\n}", publishStart) + 2);

assert.match(publishSource, /note:\s*String\(movie\.note\s*\|\|\s*""\)\.slice\(0,\s*1000\)/);
assert.match(publishSource, /publicMovies/);
assert.match(account, /movie_memory_public_sync_v3_/);
assert.match(profile, /movie\.note\?/);
assert.match(profile, /class="public-review"/);
assert.match(profile, /รีวิวของเจ้าของโปรไฟล์/);
assert.match(profile, /\$\{escapeHtml\(movie\.note\)\}/);

console.log("Public profile review publishing and rendering checks passed");
