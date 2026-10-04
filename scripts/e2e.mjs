// End-to-end walk-through on a phone-sized screen with Chromium's fake camera.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"

const URL = process.env.URL ?? "http://localhost:4173/"
const OUT = process.env.OUT ?? "test-results/e2e"
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
})
const ctx = await browser.newContext({
  viewport: { width: 384, height: 832 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
})
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const pin = async (digits) => {
  for (const d of digits) await page.getByRole("button", { name: "٠١٢٣٤٥٦٧٨٩"[Number(d)], exact: true }).click()
  await page.getByRole("button", { name: "تمام" }).click()
}

await page.goto(URL)
await shot("01-lock-setup")
await pin("246810")
await pin("246810")
await page.getByText("هنصور إيه النهارده؟").waitFor()
await shot("02-home")

// Simulated phone held upright and still.
await page.addInitScript(() => {})
const motion = () =>
  page.evaluate(() => {
    window.__m = setInterval(() => {
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          accelerationIncludingGravity: { x: 0.05, y: 9.8, z: 0.1 },
          rotationRate: { alpha: 1, beta: 1, gamma: 1 },
          interval: 16,
        }),
      )
    }, 50)
  })

await page.getByRole("button", { name: "ابدأ التصوير" }).click()
await page.locator("video").first().waitFor()
await motion()
await page.waitForTimeout(2500)
await shot("03-director")
const green = await page.locator(".viewport.is-ready").count()
console.log("frame green:", green === 1)

console.log("guide arrow hidden when green:", (await page.locator(".guide-arrow").count()) === 0)
// Hands-free: green light starts the countdown and recording by itself.
await page.locator(".rec-badge").waitFor({ timeout: 8000 })
console.log("auto-start: true")
await page.waitForTimeout(4200)
await shot("04-recording")
await page.getByRole("button", { name: "تسجيل" }).click().catch(() => {})
await page.locator(".verdict").waitFor({ timeout: 10000 })
await shot("05-review")
console.log("verdict:", await page.locator(".verdict").innerText())
console.log("checks:", (await page.locator(".checks li").allInnerTexts()).join(" | "))
const firstTitle = await page.locator(".shot-title").innerText()
await page.locator(".review .btn").first().click()
await page.waitForTimeout(800)
const nextTitle = await page.locator(".shot-title").innerText().catch(() => "")
console.log("auto-next:", nextTitle !== "" && nextTitle !== firstTitle)
await page.locator("details.more summary").click()
await shot("05b-more-tools")
await page.getByRole("button", { name: "رجوع" }).click()
await shot("06-pack")
await page.getByRole("button", { name: "رجوع" }).click()

// Request flow: project → copy prompt for the brain.
await page.getByText("طلب جديد").click()
await page.locator("input[dir=ltr]").fill("RAQ-2026-000002")
await page.getByPlaceholder(/مثلا/).fill("فيديو هادي شبه شركات المطابخ العالمية، ٣٠ ثانية")
await page.getByRole("button", { name: "انسخ الطلب" }).click()
await shot("07-request")
const prompt = await page.evaluate(() => navigator.clipboard.readText())
console.log("prompt has code:", prompt.includes("RAQ-2026-000002"))

// Brain answer pasted back.
const answer = 'دي الخطة:\n```json\n' + JSON.stringify({
  format: "raq-director/1", id: "PK-TEST-01", title: "جولة مشروع الفيلا", kind: "project",
  project_code: "RAQ-2026-000002", consent_confirmed: false,
  shots: [
    { id: "S01", title: "المطبخ كله من المدخل", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "push_in", duration_s: [3, 5] },
    { id: "S02", title: "خالد بيشرح الركنة", framing: "medium", lens: "front", height: "eye", pitch_deg: 0, move: "static", duration_s: [5, 20], prompter: "الركنة دي اتعملت ٩٠ في ٩٠ عشان التخزين يبقى مريح." },
  ],
}) + "\n```"
await page.getByRole("button", { name: "الصق رد العقل" }).click()
await page.locator("textarea").fill(answer)
await shot("08-import")
await page.getByRole("button", { name: "احفظ الخطة" }).click()
await shot("09-project-pack-consent")
await page.locator(".consent input").check()
await page.getByText("خالد بيشرح الركنة").click()
await motion()
await page.waitForTimeout(2000)
await shot("10-prompter")

// Lens setup page opens from home.
await page.getByRole("button", { name: "رجوع" }).click()
await page.getByRole("button", { name: "رجوع" }).click()
await page.getByText("ظبط العدسات").click()
await page.waitForTimeout(2500)
await shot("11-lens-setup")

console.log("errors:", errors.length ? errors : "none")
await browser.close()
