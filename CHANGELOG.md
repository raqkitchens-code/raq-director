# Changelog

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
