// Renders the RAQ Director mark into the Android launcher icons and splash.
import { chromium } from "@playwright/test"
const RES = "android/app/src/main/res"
const MARK = `<path d="M156 392V236a100 100 0 0 1 200 0v156" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
  <circle cx="256" cy="250" r="44" fill="none" stroke="#fff" stroke-width="18"/>
  <circle cx="256" cy="250" r="12" fill="#3ccf6e"/>`
const full = (round) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${round ? '<circle cx="256" cy="256" r="256" fill="#2e2e2e"/>' : '<rect width="512" height="512" fill="#2e2e2e"/>'}${MARK}</svg>`
// Adaptive foreground: 108dp canvas, the mark kept inside the 66dp safe zone.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-160 -160 832 832">${MARK}</svg>`
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
async function render(svg, w, h, path, bg = "transparent") {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.setContent(
    `<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:${h}px">${svg.replace("<svg ", `<svg width="${Math.min(w, h)}" height="${Math.min(w, h)}" `)}</body></html>`,
  )
  await page.screenshot({ path, omitBackground: bg === "transparent" })
  await page.close()
}
for (const [d, k] of Object.entries(DENS)) {
  await render(full(false), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`)
  await render(full(true), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`)
  await render(fg, 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`)
}
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${MARK}</svg>`
await render(splash, 480, 480, `${RES}/drawable/splash.png`, "#2e2e2e")
for (const [d, k] of Object.entries(DENS)) {
  await render(splash.replace("viewBox", 'data-x="1" viewBox'), Math.round(320 * k), Math.round(480 * k), `${RES}/drawable-port-${d}/splash.png`, "#2e2e2e").catch(() => {})
  await render(splash, Math.round(480 * k), Math.round(320 * k), `${RES}/drawable-land-${d}/splash.png`, "#2e2e2e").catch(() => {})
}
await browser.close()
