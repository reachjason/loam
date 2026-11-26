/**
 * Quick reference lookups, straight from the browser (both services allow it, no key needed).
 * Only the selected text is sent.
 */

export type Lookup =
  | { kind: "definition"; word: string; phonetic: string | null; senses: { pos: string; text: string; example: string | null }[]; url: string }
  | { kind: "wiki"; title: string; description: string | null; extract: string; thumb: string | null; url: string }
  | { kind: "none" };

const WIKI = "https://en.wikipedia.org";
// Wikipedia asks API clients to identify themselves; browsers can't set User-Agent, so this header is used instead.
const WIKI_HEADERS = { "Api-User-Agent": "Loam reader (personal reading app)" };

/** Strip surrounding quotes and punctuation from a selection. */
function clean(q: string) {
  return q
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’(\[]+|[\s"'“”‘’)\].,;:!?]+$/g, "")
    .replace(/[’']s$/i, "") // "Stravinsky's" → "Stravinsky"
    .trim();
}

async function definition(word: string, signal: AbortSignal): Promise<Lookup | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, { signal });
  if (!res.ok) return null;
  type Entry = { word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] };
  const [entry] = (await res.json()) as Entry[];
  if (!entry) return null;
  const senses = entry.meanings.slice(0, 3).map((m) => ({
    pos: m.partOfSpeech,
    text: m.definitions[0]?.definition ?? "",
    example: m.definitions[0]?.example ?? null,
  }));
  return { kind: "definition", word: entry.word, phonetic: entry.phonetic ?? null, senses, url: `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}` };
}

async function summary(title: string, signal: AbortSignal): Promise<Lookup | null> {
  const res = await fetch(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`, {
    signal,
    headers: WIKI_HEADERS,
  });
  if (!res.ok) return null;
  const s = (await res.json()) as {
    type: string;
    title: string;
    description?: string;
    extract: string;
    thumbnail?: { source: string };
    content_urls: { desktop: { page: string } };
  };
  if (s.type === "disambiguation" || !s.extract) return null;
  return { kind: "wiki", title: s.title, description: s.description ?? null, extract: s.extract, thumb: s.thumbnail?.source ?? null, url: s.content_urls.desktop.page };
}

async function wikipedia(q: string, signal: AbortSignal): Promise<Lookup | null> {
  const direct = await summary(q, signal);
  if (direct) return direct;
  // Not an exact article title: take the best title match.
  const res = await fetch(`${WIKI}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`, { signal, headers: WIKI_HEADERS });
  if (!res.ok) return null;
  const { pages } = (await res.json()) as { pages: { key: string }[] };
  return pages[0] ? summary(pages[0].key, signal) : null;
}

export async function lookUp(selection: string, signal: AbortSignal): Promise<Lookup> {
  const q = clean(selection).slice(0, 120);
  if (!q) return { kind: "none" };
  const singleWord = /^[\p{L}-]+$/u.test(q) && !/^\p{Lu}/u.test(q); // capitalised words are usually names
  if (singleWord) {
    const d = await definition(q, signal).catch(() => null);
    if (d) return d;
  }
  return (await wikipedia(q, signal).catch(() => null)) ?? (singleWord ? { kind: "none" } : ((await definition(q, signal).catch(() => null)) ?? { kind: "none" }));
}

export const googleUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(clean(q))}`;
