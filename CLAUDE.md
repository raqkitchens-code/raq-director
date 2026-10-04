# RAQ Director — notes for Claude

- Standalone app. It must not depend on RAQ OS, Supabase or any server; it receives shoot packs (`docs/PACK_FORMAT.md`).
- Keep `connect-src 'self'` in `vercel.json`. Any feature that sends data out needs Khaled's approval first.
- UI text is Egyptian Arabic. English words never inside an Arabic sentence.
- Code via branch → PR → CI → merge commit (DEC-37). Before pushing: `npm run typecheck && npm test && npm run build`.
- Android app: `android/` (Capacitor + `RaqCameraPlugin.java`). Built only in CI (`.github/workflows/android.yml`); the sandbox cannot reach Google's Maven. Install notes in `docs/ANDROID.md`.
