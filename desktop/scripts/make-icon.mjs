// Generates desktop/build/icon.png (1024×1024); electron-builder derives .icns/.ico from it.
// Run once after changing the design: node desktop/scripts/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
const px = new Float32Array(SIZE * SIZE * 4); // premultiplied RGBA, 0..1

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Draws a shape given by a signed distance function (negative inside) with 1px anti-aliasing. */
function fill(sdf, color, alpha = 1) {
  const [r, g, b] = hex(color);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cover = Math.min(1, Math.max(0, 0.5 - sdf(x + 0.5, y + 0.5))) * alpha;
      if (cover <= 0) continue;
      const i = (y * SIZE + x) * 4;
      px[i] = r * cover + px[i] * (1 - cover);
      px[i + 1] = g * cover + px[i + 1] * (1 - cover);
      px[i + 2] = b * cover + px[i + 2] * (1 - cover);
      px[i + 3] = cover + px[i + 3] * (1 - cover);
    }
  }
}

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
/** Circular sector (view cone) from (cx, cy) with radius r around angle a ± half. */
const cone = (cx, cy, r, a, half) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  let da = Math.atan2(y - cy, x - cx) - a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.max(d - r, (Math.abs(da) - half) * Math.max(d, 1));
};

// macOS-style icon: content inset ~10%, rounded square background.
fill(roundRect(100, 100, 924, 924, 180), '#141a22');
fill(roundRect(100, 100, 924, 924, 180), '#1d2632', 0.6);
// Grid of a stylized radar.
for (let i = 1; i < 4; i++) {
  const t = 100 + (824 * i) / 4;
  fill((x, y) => Math.abs(x - t) - 2 + (y < 140 || y > 884 ? 99 : 0), '#2a3644');
  fill((x, y) => Math.abs(y - t) - 2 + (x < 140 || x > 884 ? 99 : 0), '#2a3644');
}
// CT player with view cone.
fill(cone(390, 600, 250, -0.35, 0.45), '#5aa9e6', 0.3);
fill(circle(390, 600, 92), '#0b0e12');
fill(circle(390, 600, 78), '#5aa9e6');
// T player with view cone.
fill(cone(640, 340, 220, 2.2, 0.45), '#eab64a', 0.3);
fill(circle(640, 340, 80), '#0b0e12');
fill(circle(640, 340, 66), '#eab64a');

// Encode PNG (RGBA, non-premultiplied).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const a = px[i + 3];
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 3; c++) raw[o + c] = a > 0 ? Math.round(Math.min(1, px[i + c] / a) * 255) : 0;
    raw[o + 3] = Math.round(a * 255);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../build/icon.png', import.meta.url), png);
console.log('Wrote desktop/build/icon.png');
