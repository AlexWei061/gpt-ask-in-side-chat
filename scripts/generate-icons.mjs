import { mkdir } from "node:fs/promises";
import sharp from "sharp";
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#111827"/><path d="M27 31h74v50H61L39 101V81H27z" fill="#fff"/><path d="M72 42h18v28H72z" fill="#60a5fa"/></svg>`);
await mkdir("public/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
