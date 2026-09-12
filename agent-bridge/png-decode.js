// Minimal PNG → RGBA decoder for System.Drawing-produced PNGs.
// Supports 8-bit, non-interlaced, color type 2 (RGB) and 6 (RGBA).
const zlib = require("zlib");

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, ct = 6, idat = [];
  while (off < buf.length - 8) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!w || !h || !idat.length) throw new Error("bad PNG");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 4;
  const stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.slice(pos, pos + stride); pos += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      let val;
      if (f === 0) val = v;
      else if (f === 1) val = v + a;
      else if (f === 2) val = v + b;
      else if (f === 3) val = v + ((a + b) >> 1);
      else val = v + paeth(a, b, c);
      cur[x] = val & 255;
    }
    for (let x = 0; x < w; x++) {
      const si = x * bpp, di = x * 4;
      rgba[di] = cur[si]; rgba[di + 1] = cur[si + 1]; rgba[di + 2] = cur[si + 2]; rgba[di + 3] = bpp === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { rgba, width: w, height: h };
}

module.exports = { decodePng };
