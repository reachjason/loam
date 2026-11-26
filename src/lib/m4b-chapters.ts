/**
 * Reads chapter markers from an MP4 audiobook (.m4b/.m4a) without loading the whole file.
 * Supports QuickTime chapter tracks (iTunes, most tools) and Nero "chpl" atoms (ffmpeg, mp4v2).
 */
export type AudioChapter = { title: string; start: number };

type Box = { type: string; start: number; end: number; body: number };

function* boxes(v: DataView, start: number, end: number): Generator<Box> {
  let p = start;
  while (p + 8 <= end) {
    let size = v.getUint32(p);
    const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
    let hdr = 8;
    if (size === 1) {
      size = Number(v.getBigUint64(p + 8));
      hdr = 16;
    } else if (size === 0) size = end - p;
    if (size < hdr) return;
    yield { type, start: p, end: Math.min(p + size, end), body: p + hdr };
    p += size;
  }
}

const child = (v: DataView, b: Box | undefined, type: string) =>
  b ? [...boxes(v, b.body, b.end)].find((c) => c.type === type) : undefined;
const path = (v: DataView, b: Box | undefined, ...types: string[]) => types.reduce((cur, t) => child(v, cur, t), b);

async function findMoov(file: Blob): Promise<DataView | null> {
  let p = 0;
  while (p + 8 <= file.size) {
    const h = new DataView(await file.slice(p, p + 16).arrayBuffer());
    let size = h.getUint32(0);
    const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) size = Number(h.getBigUint64(8));
    else if (size === 0) size = file.size - p;
    if (size < 8) return null;
    if (type === "moov") return new DataView(await file.slice(p, p + size).arrayBuffer());
    p += size;
  }
  return null;
}

function nero(v: DataView, moov: Box): AudioChapter[] {
  const chpl = path(v, moov, "udta", "chpl");
  if (!chpl) return [];
  let p = chpl.body;
  const version = v.getUint8(p);
  p += 4 + (version ? 4 : 0);
  const count = v.getUint8(p++);
  const out: AudioChapter[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count && p + 9 <= chpl.end; i++) {
    const start = Number(v.getBigUint64(p)) / 1e7;
    const len = v.getUint8(p + 8);
    out.push({ start, title: dec.decode(new Uint8Array(v.buffer, v.byteOffset + p + 9, len)) });
    p += 9 + len;
  }
  return out;
}

async function quicktime(file: Blob, v: DataView, moov: Box): Promise<AudioChapter[]> {
  const traks = [...boxes(v, moov.body, moov.end)].filter((b) => b.type === "trak");
  const trackId = (t: Box) => {
    const tkhd = child(v, t, "tkhd")!;
    return v.getUint32(tkhd.body + (v.getUint8(tkhd.body) === 1 ? 20 : 12));
  };
  let chapId: number | null = null;
  for (const t of traks) {
    const chap = path(v, t, "tref", "chap");
    if (chap && chap.end - chap.body >= 4) chapId = v.getUint32(chap.body);
  }
  const trak = chapId === null ? undefined : traks.find((t) => trackId(t) === chapId);
  if (!trak) return [];

  const mdhd = path(v, trak, "mdia", "mdhd")!;
  const timescale = v.getUint32(mdhd.body + (v.getUint8(mdhd.body) === 1 ? 20 : 12));
  const stbl = path(v, trak, "mdia", "minf", "stbl");
  const stts = child(v, stbl, "stts");
  const stsz = child(v, stbl, "stsz");
  const stsc = child(v, stbl, "stsc");
  const stco = child(v, stbl, "stco") ?? child(v, stbl, "co64");
  if (!timescale || !stts || !stsz || !stsc || !stco) return [];

  const starts: number[] = [];
  let t = 0;
  for (let i = 0, n = v.getUint32(stts.body + 4); i < n; i++) {
    const count = v.getUint32(stts.body + 8 + i * 8);
    const delta = v.getUint32(stts.body + 12 + i * 8);
    for (let j = 0; j < count; j++, t += delta) starts.push(t / timescale);
  }
  const fixed = v.getUint32(stsz.body + 4);
  const nSamples = v.getUint32(stsz.body + 8);
  const sizes = Array.from({ length: nSamples }, (_, i) => fixed || v.getUint32(stsz.body + 12 + i * 4));
  const wide = stco.type === "co64";
  const chunks = Array.from({ length: v.getUint32(stco.body + 4) }, (_, i) =>
    wide ? Number(v.getBigUint64(stco.body + 8 + i * 8)) : v.getUint32(stco.body + 8 + i * 4),
  );
  const runs = Array.from({ length: v.getUint32(stsc.body + 4) }, (_, i) => ({
    first: v.getUint32(stsc.body + 8 + i * 12),
    per: v.getUint32(stsc.body + 12 + i * 12),
  }));

  const offsets: number[] = [];
  for (let c = 0, s = 0; c < chunks.length && s < nSamples; c++) {
    const per = runs.findLast((r) => r.first <= c + 1)?.per ?? 1;
    let off = chunks[c];
    for (let k = 0; k < per && s < nSamples; k++, s++) {
      offsets.push(off);
      off += sizes[s];
    }
  }

  const dec = new TextDecoder();
  const out: AudioChapter[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const buf = new DataView(await file.slice(offsets[i], offsets[i] + sizes[i]).arrayBuffer());
    const len = buf.byteLength >= 2 ? Math.min(buf.getUint16(0), buf.byteLength - 2) : 0;
    out.push({ start: starts[i] ?? 0, title: dec.decode(new Uint8Array(buf.buffer, 2, len)) });
  }
  return out;
}

export async function readChapters(file: Blob): Promise<AudioChapter[]> {
  try {
    const v = await findMoov(file);
    if (!v) return [];
    const moov: Box = { type: "moov", start: 0, end: v.byteLength, body: 8 };
    const qt = await quicktime(file, v, moov);
    const list = qt.length ? qt : nero(v, moov);
    return list.map((c, i) => ({ ...c, title: c.title.trim() || `Chapter ${i + 1}` }));
  } catch (e) {
    console.warn("[m4b] couldn't read chapters", e);
    return [];
  }
}
