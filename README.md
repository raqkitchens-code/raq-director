# مخرج راق · RAQ Director

أداة تصوير مستقلة على الموبايل. العقل (مشروع «عقل راق») بيبعتلها خطة لقطات، وهي بتفتح الكاميرا، وتوجّه الكادر لحد ما ينوّر أخضر، وتشتغل ملقّن، وتقيّم كل لقطة، وتحفظها على الموبايل.

A standalone phone web app (installable, full screen). No server, no account, no outside connections:
plans come in by link, paste or file, footage stays on the phone until Khaled exports it.

## Flow
1. **هنصور إيه النهارده؟** — the home screen lists the next shots with no accepted take (from the active plan, else the RAQ shot library).
2. **طلب جديد** — project / script / general shots: write rules or a prompt, copy the request to the brain, paste its answer back
   (format: [`docs/PACK_FORMAT.md`](docs/PACK_FORMAT.md)). Survey («معاينة»), handover («تسليم») and project-tour templates and script splitting work without the brain.
   A pack link (`/p#1.…`, see the format doc) opens straight into «احفظ الخطة».
3. **المخرج** — camera with grid, horizon level, pitch target, reference ghost + edge match, light and focus checks.
   The frame turns green when everything measurable is right. Teleprompter, tap to focus, torch, zoom, per-lens camera memory.
4. **التقييم** — duration, level, pitch, steadiness, light, sharpness, reference match → «مقبولة» or «محتاجة تتعاد».
5. **اللقطات المحفوظة** — export through the Android share sheet (Gallery, Dropbox) with RAQ file names.

## Security
- PIN lock (6–8 digits, PBKDF2-SHA-256 hash on the phone only), slows down after wrong tries, re-locks after 1 minute in the background.
- Strict Content-Security-Policy: `connect-src 'self'` — the app cannot send data anywhere. Camera/mic allowed for this site only.
- Footage lives in the browser's private storage on the phone (encrypted by Android at rest) and leaves only when exported.
- Client projects are locked until consent is confirmed (DEC-51).

## Limits (browser, today)
- Height from the floor cannot be measured; it is given as an instruction in cm.
- Which back camera is the ultra-wide / tele is not reported by the browser; pick it once per lens.
- Focus state is not reported; sharpness is measured from the image instead.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173 (camera works on localhost or https)
npm test           # unit tests
npm run build
npx vite preview --port 4173 & node scripts/e2e.mjs   # phone-size walk-through with a fake camera
```
Deploy: Vercel, framework Vite, output `dist` (headers in `vercel.json`).
