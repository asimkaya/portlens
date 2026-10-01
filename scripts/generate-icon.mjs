// Draws the Portlens app icon to app/app-icon.png (1024x1024).
// Run `npm run tauri icon app-icon.png` inside app/ afterwards to produce the
// platform icon set. Kept as a script so the icon can be regenerated without a
// design tool.
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 1024;
const SAMPLES = 4; // per axis, for anti-aliasing

const lagoonTop = [0x2b, 0xbf, 0xb9];
const lagoonBottom = [0x12, 0x8a, 0x88];
const foam = [0xff, 0xff, 0xff];
const buoy = [0xff, 0xb5, 0x47];

const lens = { cx: 0.455, cy: 0.445, radius: 0.235, stroke: 0.08 };
const handle = { from: [0.62, 0.61], to: [0.78, 0.77], width: 0.095 };
const dot = { cx: lens.cx, cy: lens.cy, radius: 0.07 };

function roundedSquare(x, y, half, corner) {
  const dx = Math.abs(x - 0.5) - (half - corner);
  const dy = Math.abs(y - 0.5) - (half - corner);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - corner;
}

function capsule(x, y, [ax, ay], [bx, by], width) {
  const px = x - ax, py = y - ay;
  const sx = bx - ax, sy = by - ay;
  const t = Math.max(0, Math.min(1, (px * sx + py * sy) / (sx * sx + sy * sy)));
  return Math.hypot(px - sx * t, py - sy * t) - width / 2;
}

function sample(x, y) {
  if (roundedSquare(x, y, 0.5, 0.225) > 0) return null;

  const t = y;
  let color = lagoonTop.map((c, i) => c + (lagoonBottom[i] - c) * t);

  const ring = Math.abs(Math.hypot(x - lens.cx, y - lens.cy) - lens.radius) - lens.stroke / 2;
  if (ring < 0 || capsule(x, y, handle.from, handle.to, handle.width) < 0) color = foam;
  if (Math.hypot(x - dot.cx, y - dot.cy) < dot.radius) color = buoy;
  return color;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const color = sample((px + (sx + 0.5) / SAMPLES) / SIZE, (py + (sy + 0.5) / SAMPLES) / SIZE);
        if (!color) continue;
        r += color[0]; g += color[1]; b += color[2]; hits++;
      }
    }
    const o = (py * SIZE + px) * 4;
    if (hits) {
      pixels[o] = r / hits;
      pixels[o + 1] = g / hits;
      pixels[o + 2] = b / hits;
    }
    pixels[o + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
  }
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA

// Each scanline is prefixed with filter type 0 (none).
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "app-icon.png");
writeFileSync(target, png);
console.log(`wrote ${target}`);
