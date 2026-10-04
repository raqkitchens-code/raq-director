# RAQ Director on Android

The same app, packaged as an Android app so it can use the phone's real camera:
every lens (ultra-wide 0.6, 1×, 2×, 3×, front) and saving every take straight into the gallery.

## Install on the phone
1. Open the repo's latest **android** run in GitHub Actions and download `raq-director-apk`
   (or the APK attached in the project thread).
2. Open the downloaded `raq-director-<version>.apk`. Android asks to allow installs from this
   source once: allow it, then install.
3. Open «مخرج راق», allow camera and microphone.

New versions install over the old one and keep the takes and plans (same signing key).

## How it is built
- `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`
- CI does this on every push and then runs the app on an emulator
  (`scripts/android-e2e.mjs`): unlock, open a shot, try the wide lens, record, and check that the
  take is in the gallery under `Movies/RAQ`.
- The debug key `android/app/raq-debug.keystore` uses Android's public debug password. It only keeps
  updates installable over each other. A real release key should live in a GitHub secret.

## Lenses
`RaqCameraPlugin` picks the lens in this order:
1. zoom on the main camera when its range goes below 1× (Samsung opens the ultra-wide this way);
2. a separate back camera with a wider view;
3. a physical camera behind the main one.
The «العدسات» page lists what the phone gives the app (view angle, zoom range, physical cameras).

## Privacy
No network calls. Takes go to the phone's gallery only. Speech uses the phone's own engine.
