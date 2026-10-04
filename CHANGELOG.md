# Changelog

## 0.3.0 — 2026-10-04
- Android app (Capacitor) around the same screens, built by CI as an installable APK.
- Native camera (CameraX): reaches the ultra-wide through zoom below 1× on the main camera,
  or a separate / physical wide camera when the phone exposes it; 1×, 2×, 3× and front.
- Lens rail on the camera screen (٫٦ ١ ٢ ٣) and a lens report page with each camera's view angle.
- Every take is saved straight into the gallery (Movies/RAQ); a dropped take is removed from it.
- Spoken Arabic through the phone's own text-to-speech, vibration through the app.
- Framing checks fed by a small grayscale frame from the native camera.
- CI runs the app on an emulator: unlock, open a shot, record, check the gallery.

## 0.2.2 — 2026-10-04
- Flip button on the shot screen: switch any shot to the front camera (stories, talking to camera).
- Wide shots on a phone whose browser gives no wide lens: a note to shoot at 1× and step back.
- Lens setup shows each camera's name and zoom range, how many cameras the browser sees,
  and retries a lens at 1280×720 when it refuses the default size.
- The unmapped-lens banner stops once lens setup was finished.
- Brain prompt: prefer lens 1 and front until the wide lens is reachable.

## 0.2.1 — 2026-10-04
- Lens setup: a camera that fails to open is retried (Android releases the previous camera
  a moment late), and the reason is shown with a retry button.
- Opening a camera on the shot screen retries the same way.
- Lens setup notes when a camera can zoom out below 1× by itself.

## 0.2.0 — 2026-10-04
- Easier control: the director now tells you the one next correction (big arrow on screen,
  spoken Arabic when the phone has an Arabic voice, short beeps otherwise).
- Vibration and a chime when the frame turns green; countdown beeps.
- Auto-start on by default: a green frame held for a moment starts the countdown and recording.
  Cancelling a countdown pauses auto-start until the frame leaves green.
- Auto-next: keeping an accepted take opens the next unshot shot.
- Clean camera screen: lens, height in cm and move at a glance; everything else under one drawer.
- One-time lens setup with a picture from every back camera (home tile and a banner on the shot).
- Choices (voice, vibration, auto-start, auto-next) remembered on the phone.

## 0.1.0 — 2026-10-04
- First version of RAQ Director (مخرج راق): standalone phone shooting assistant.
- Shoot packs (`raq-director/1`) from the RAQ brain: paste the answer or open a file.
- Built-in RAQ general shot library (13 shots) and a project-tour template (8 shots).
- Script → teleprompter shots.
- Director screen: rule-of-thirds grid, horizon level, camera pitch target, reference ghost
  and edge match, light and focus checks, green frame when everything measurable is right,
  tap to focus, torch, zoom, per-lens camera memory, optional auto-start, teleprompter.
- Take review: duration, level, pitch, steadiness, light, sharpness, reference match → accepted / retake.
- Takes stored on the phone only (IndexedDB), exported through the Android share sheet with RAQ file names.
- PIN lock (PBKDF2), re-lock after 1 minute in the background, strict CSP with no outside connections, offline shell.
