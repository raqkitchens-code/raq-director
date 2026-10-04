import "@fontsource/ibm-plex-sans-arabic/400.css"
import "@fontsource/ibm-plex-sans-arabic/600.css"
import "@fontsource/ibm-plex-sans-arabic/700.css"
import "./styles.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { isNative } from "./lib/native"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline app shell, so the director works on site without internet.
// The Android app ships its files inside, so it needs no offline cache (and a cache would hide updates).
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}
