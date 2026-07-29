import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../Movie Memory/recommendations.js", import.meta.url), "utf8");

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.innerHTML = "";
    this.textContent = "";
    this.src = "";
    this.listeners = new Map();
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classNames.add(name)),
      remove: (...names) => names.forEach(name => this.classNames.delete(name)),
      contains: name => this.classNames.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

function createTmdbMock() {
  const calls = [];
  const payloadFor = url => {
    const path = new URL(url).pathname;
    if (path.endsWith("/genre/movie/list")) {
      return { genres: [{ id: 18, name: "Drama" }, { id: 12, name: "Adventure" }] };
    }
    if (path.endsWith("/movie/101")) {
      return { id: 101, title: "Seen Movie", genres: [{ id: 18, name: "Drama" }] };
    }
    if (path.endsWith("/movie/101/recommendations")) {
      return { results: [{ id: 201, title: "Personal Pick", genre_ids: [18], release_date: "2026-06-01", vote_average: 8.2, vote_count: 1200, popularity: 90, poster_path: "/personal.jpg" }] };
    }
    if (path.endsWith("/discover/movie")) {
      return { results: [{ id: 202, title: "Taste Match", genre_ids: [18, 12], release_date: "2025-10-01", vote_average: 7.8, vote_count: 800, popularity: 75, poster_path: "/taste.jpg" }] };
    }
    if (path.endsWith("/movie/now_playing")) {
      return { results: [{ id: 203, title: "New Release", genre_ids: [12], release_date: "2026-07-01", vote_average: 7.1, vote_count: 400, popularity: 80, poster_path: "/new.jpg" }] };
    }
    if (path.endsWith("/movie/popular")) {
      return { results: [{ id: 204, title: "Popular Movie", genre_ids: [12], release_date: "2026-01-01", vote_average: 7.5, vote_count: 1400, popularity: 130, poster_path: "/popular.jpg" }] };
    }
    if (path.endsWith("/movie/upcoming")) {
      return { results: [{ id: 205, title: "Coming Soon", genre_ids: [18], release_date: "2026-10-01", vote_average: 7, vote_count: 250, popularity: 65, poster_path: "/soon.jpg" }] };
    }
    throw new Error(`Unexpected TMDB request: ${url}`);
  };
  return {
    calls,
    fetch: async url => {
      calls.push(String(url));
      return { ok: true, json: async () => payloadFor(String(url)) };
    }
  };
}

async function runScenario(collection) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const storage = new Map([["taithai_movie_memory_v2", JSON.stringify(collection)]]);
  const tmdb = createTmdbMock();
  const windowObject = {
    location: { protocol: "file:" },
    MovieMemoryPreferences: { get: () => ({ language: "th" }) }
  };
  const context = vm.createContext({
    window: windowObject,
    document: { getElementById: element },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    fetch: tmdb.fetch,
    URL,
    URLSearchParams,
    AbortController,
    Map,
    Set,
    Array,
    Number,
    String,
    Math,
    JSON,
    Promise,
    Intl,
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(source, context, { filename: "recommendations.js" });
  await new Promise(resolve => setTimeout(resolve, 80));
  return { element, calls: tmdb.calls };
}

const personalized = await runScenario([{
  id: "m_101",
  tmdbId: 101,
  title: "Seen Movie",
  releaseDate: "2024-01-01",
  rating: 5,
  viewings: [{ id: "v_1" }]
}]);

assert.match(personalized.element("recommendationGrid").innerHTML, /Personal Pick/);
assert.match(personalized.element("recommendationGrid").innerHTML, /Taste Match/);
assert.match(personalized.element("recommendationGrid").innerHTML, /\.\/index\.html\?tmdb=201/);
assert.doesNotMatch(personalized.element("recommendationGrid").innerHTML, />Seen Movie</);
assert.match(personalized.element("recommendationSummary").innerHTML, /ใช้คะแนน 1 เรื่อง/);
assert.equal(personalized.element("tastePanel").hidden, false);
assert.ok(personalized.calls.some(url => url.includes("/movie/101/recommendations")));
assert.ok(personalized.calls.some(url => url.includes("/discover/movie")));

const general = await runScenario([]);
assert.match(general.element("recommendationGrid").innerHTML, /New Release|Popular Movie|Coming Soon/);
assert.match(general.element("recommendationSummary").innerHTML, /ยังไม่มีคอลเลกชัน/);
assert.equal(general.element("tastePanel").hidden, true);
assert.ok(!general.calls.some(url => url.includes("/recommendations")));

console.log("Recommendation scenarios passed");
