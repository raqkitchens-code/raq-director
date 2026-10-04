import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.raqkitchens.director",
  appName: "مخرج راق",
  webDir: "dist",
  android: {
    // The camera preview is drawn natively behind a transparent web view.
    backgroundColor: "#00000000",
  },
}

export default config
