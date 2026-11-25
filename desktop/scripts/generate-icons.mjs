// Generates every app icon from branding/logo.svg (+ logo-maskable.svg).
// Run from desktop/: `npm run icons`
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const brand = path.join(root, "branding");
const pub = path.join(root, "public");
const build = path.resolve(here, "..", "build");

const logo = await fs.readFile(path.join(brand, "logo.svg"));
const maskable = await fs.readFile(path.join(brand, "logo-maskable.svg"));

// rasterise at high density, then downscale for crisp small sizes
const png = (svg, size) =>
  sharp(svg, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

const out = async (file, buf) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  console.log("wrote", path.relative(root, file));
};

// web app (favicon / PWA)
await out(path.join(pub, "favicon.svg"), logo);
await out(path.join(pub, "favicon-16x16.png"), await png(logo, 16));
await out(path.join(pub, "favicon-32x32.png"), await png(logo, 32));
await out(path.join(pub, "apple-touch-icon.png"), await png(maskable, 180));
await out(path.join(pub, "android-chrome-192x192.png"), await png(logo, 192));
await out(path.join(pub, "android-chrome-512x512.png"), await png(logo, 512));
await out(path.join(pub, "maskable_icon_x192.png"), await png(maskable, 192));
await out(path.join(pub, "maskable_icon_x512.png"), await png(maskable, 512));
await out(
  path.join(pub, "favicon.ico"),
  await pngToIco([
    await png(logo, 16),
    await png(logo, 32),
    await png(logo, 48),
  ]),
);

// desktop (Windows exe / installer / taskbar)
await out(path.join(build, "icon.png"), await png(logo, 512));
await out(
  path.join(build, "icon.ico"),
  await pngToIco(
    await Promise.all([16, 24, 32, 48, 64, 128, 256].map((s) => png(logo, s))),
  ),
);
