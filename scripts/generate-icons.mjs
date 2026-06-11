import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const sizes = [16, 32, 48, 128];
const outDir = new URL("../public/", import.meta.url);
const sourceUrl = new URL("../icon.png", import.meta.url);
const source = PNG.sync.read(readFileSync(sourceUrl));

mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("icon.png", outDir), PNG.sync.write(source));

for (const size of sizes) {
  writeFileSync(new URL(`icon${size}.png`, outDir), PNG.sync.write(resizePng(source, size, size)));
}

function resizePng(sourcePng, width, height) {
  const target = new PNG({ width, height });
  const scaleX = sourcePng.width / width;
  const scaleY = sourcePng.height / height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = x * scaleX;
      const sourceTop = y * scaleY;
      const sourceRight = sourceLeft + scaleX;
      const sourceBottom = sourceTop + scaleY;
      setPixel(target, x, y, sampleArea(sourcePng, sourceLeft, sourceTop, sourceRight, sourceBottom));
    }
  }

  return target;
}

function sampleArea(png, left, top, right, bottom) {
  const xStart = Math.floor(left);
  const yStart = Math.floor(top);
  const xEnd = Math.ceil(right);
  const yEnd = Math.ceil(bottom);
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let total = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    const vertical = overlap(top, bottom, y, y + 1);
    if (vertical <= 0) continue;

    for (let x = xStart; x < xEnd; x += 1) {
      const horizontal = overlap(left, right, x, x + 1);
      if (horizontal <= 0) continue;

      const weight = horizontal * vertical;
      const pixel = getPixel(png, clamp(x, 0, png.width - 1), clamp(y, 0, png.height - 1));
      const normalizedAlpha = pixel[3] / 255;
      red += pixel[0] * normalizedAlpha * weight;
      green += pixel[1] * normalizedAlpha * weight;
      blue += pixel[2] * normalizedAlpha * weight;
      alpha += normalizedAlpha * weight;
      total += weight;
    }
  }

  if (total === 0 || alpha === 0) {
    return [0, 0, 0, 0];
  }

  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round((alpha / total) * 255)
  ];
}

function getPixel(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3]
  ];
}

function setPixel(png, x, y, color) {
  const offset = (y * png.width + x) * 4;
  png.data[offset] = color[0];
  png.data[offset + 1] = color[1];
  png.data[offset + 2] = color[2];
  png.data[offset + 3] = color[3];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function overlap(leftA, rightA, leftB, rightB) {
  return Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));
}
