# RAQ Director — notes for Claude

- Standalone app. It must not depend on RAQ OS, Supabase or any server; it receives shoot packs (`docs/PACK_FORMAT.md`).
- Keep `connect-src 'self'` in `vercel.json`. Any feature that sends data out needs Khaled's approval first.
- UI text is Egyptian Arabic. English words never inside an Arabic sentence.
- Code via branch → PR → CI → merge commit (DEC-37). Before pushing: `npm run typecheck && npm test && npm run build`.
