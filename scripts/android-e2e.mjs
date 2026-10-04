// Drives the installed Android app on an emulator (CI) through its web view.
// Needs: adb on PATH, the app installed with camera + microphone granted.
// Usage: node scripts/android-e2e.mjs
import { _android } from "playwright-core"
import { mkdirSync, writeFileSync } from "node:fs"

const PKG = "com.raqkitchens.director"
const OUT = process.env.OUT ?? "test-results/android"
mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log("[e2e]", ...a)
const results = {}

const [device] = await _android.devices()
if (!device) throw new Error("no device")
log("device", device.model())

await device.shell(`am start -n ${PKG}/.MainActivity`)
const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 })
const page = await webview.page()
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text())
})

const snap = async (n) => writeFileSync(`${OUT}/${n}.png`, await device.screenshot())
const pin = async (digits) => {
  for (const d of digits) await page.getByRole("button", { name: "٠١٢٣٤٥٦٧٨٩"[Number(d)], exact: true }).click()
  await page.getByRole("button", { name: "تمام" }).click()
}

try {
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1500)
  await snap("01-lock")
  await pin("246810")
  await pin("246810")
  await page.getByText("هنصور إيه النهارده؟").waitFor({ timeout: 15_000 })
  await snap("02-home")

  // Lens report straight from the plugin.
  results.lenses = await page.evaluate(() => window.Capacitor?.Plugins?.RaqCamera?.lenses())
  log("lenses", JSON.stringify(results.lenses))

  await page.getByRole("button", { name: "ابدأ التصوير" }).click()
  await page.waitForTimeout(6000)
  await snap("03-director")
  results.camThrough = await page.evaluate(() => document.documentElement.classList.contains("cam-through"))
  results.pills = await page.locator(".lens-pills .pill").count()
  results.errorBanner = await page.locator(".controls .banner.warn").allInnerTexts()
  log("director", JSON.stringify(results))

  // Wide lens pill: what the app could do on this phone.
  if (results.pills) {
    await page.locator(".lens-pills .pill").first().click()
    await page.waitForTimeout(3000)
    await snap("04-wide")
    results.wideBanner = await page.locator(".controls .banner").allInnerTexts()
    await page.locator(".lens-pills .pill").nth(1).click()
    await page.waitForTimeout(2500)
  }

  // Record: tap record (cancels auto-start if it already began, so tap until recording).
  const rec = page.getByRole("button", { name: "تسجيل" })
  for (let i = 0; i < 3 && !(await page.locator(".rec-badge").count()); i++) {
    if (await page.locator(".countdown").count()) {
      await page.locator(".rec-badge").waitFor({ timeout: 6000 }).catch(() => {})
      break
    }
    await rec.click()
    await page.waitForTimeout(4200)
  }
  results.recording = (await page.locator(".rec-badge").count()) > 0
  await page.waitForTimeout(4000)
  await snap("05-recording")
  await rec.click().catch(() => {})
  await page.locator(".verdict").waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await snap("06-review")
  results.verdict = await page.locator(".verdict").innerText()
  results.savedNote = await page.getByText("اتحفظت في الجاليري").count()
  results.reviewBanner = await page.locator(".review .banner").allInnerTexts()
  await page.locator(".review .btn").first().click()
  await page.waitForTimeout(1500)

  // Front camera
  await page.getByRole("button", { name: "الكاميرا الأمامية" }).click().catch(() => {})
  await page.waitForTimeout(3000)
  await snap("07-front")
} catch (e) {
  results.failure = String(e)
  await snap("99-failure").catch(() => {})
}

const media = (await device.shell("content query --uri content://media/external/video/media --projection _display_name:relative_path")).toString()
results.gallery = media.split("\n").filter((l) => l.includes("RAQ"))
results.errors = errors
log("RESULT", JSON.stringify(results, null, 2))
writeFileSync(`${OUT}/result.json`, JSON.stringify(results, null, 2))
await device.close()
if (results.failure || !results.gallery.length) process.exit(1)
