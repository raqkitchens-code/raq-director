// Renders public/icon.svg to the PNG sizes the manifest needs.
import { chromium } from "@playwright/test"
import { readFileSync } from "node:fs"
const svg = readFileSync("public/icon.svg", "utf8")
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<html><body style="margin:0;background:#2e2e2e">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: false })
  await page.close()
}
await browser.close()
