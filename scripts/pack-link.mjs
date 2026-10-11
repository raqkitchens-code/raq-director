// Turns a shoot pack file into a link that opens it in «مخرج راق».
//   node scripts/pack-link.mjs pack.json            -> https://raq-director.vercel.app/p#1.…
//   node scripts/pack-link.mjs pack.json --origin http://localhost:5173
// The pack rides in the fragment (after "#"), which is never sent to any server.
import { readFileSync } from "node:fs"
import { deflateRawSync } from "node:zlib"

const [file, ...rest] = process.argv.slice(2)
if (!file) {
  console.error("usage: node scripts/pack-link.mjs <pack.json> [--origin <url>]")
  process.exit(2)
}
const at = rest.indexOf("--origin")
const origin = at >= 0 ? rest[at + 1] : "https://raq-director.vercel.app"

const text = readFileSync(file, "utf8")
const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
const pack = JSON.parse(fenced ? fenced[1] : text)
if (pack.format !== "raq-director/1" || !Array.isArray(pack.shots)) {
  console.error("not a raq-director/1 pack")
  process.exit(1)
}
const body = deflateRawSync(Buffer.from(JSON.stringify(pack), "utf8"), { level: 9 }).toString("base64url")
const url = `${origin}/p#1.${body}`
if (url.length > 30000) console.error(`warning: the link is ${url.length} characters; drop reference_image to shorten it`)
console.log(url)
