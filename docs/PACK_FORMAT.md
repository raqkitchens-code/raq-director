# صيغة خطة التصوير · raq-director/1

الملف ده للعقل (مشروع «عقل راق» على كلود): إزاي يكتب خطة تصوير مخرج راق يقدر يقراها.

The brain answers with **one JSON object inside a ```json code fence**. Khaled pastes the whole answer
into «استلم خطة من العقل», or taps a pack link (below). Anything outside the fence is ignored.

```json
{
  "format": "raq-director/1",
  "id": "PK-2026-10-04-01",
  "title": "جولة مشروع الفيلا",
  "kind": "project",
  "project_code": "RAQ-2026-000002",
  "consent_confirmed": false,
  "notes": "ملاحظة عامة للمصوّر",
  "shots": [
    {
      "id": "S01",
      "title": "المطبخ كله من المدخل",
      "purpose": "أجمل لقطة في أول ٣ ثواني",
      "framing": "wide",
      "lens": "0.6",
      "height": "chest",
      "pitch_deg": 0,
      "pitch_tol": 4,
      "roll_tol": 2,
      "move": "push_in",
      "duration_s": [3, 5],
      "prompter": "",
      "direction": "شيل أي حاجة شخصية للعميل من الكادر",
      "pillar": "real_projects",
      "needs_consent": true,
      "reference_image": null
    }
  ]
}
```

| Field | Values | Notes |
|---|---|---|
| `kind` | `library` · `project` · `script` | `project` needs `project_code` (`RAQ-YYYY-NNNNNN`) and is locked until consent (DEC-51) |
| `framing` | `wide` · `medium` · `close` · `detail` | |
| `lens` | `0.6` · `1` · `2` · `3` · `front` | Khaled maps each lens to a phone camera once; zoom is used until then |
| `height` | `floor` · `knee` · `waist` · `chest` · `eye` · `high` | shown with an approximate height in cm |
| `pitch_deg` | −90 … 90 | 0 = level, negative = camera looking down |
| `pitch_tol`, `roll_tol` | degrees | defaults 4 and 2 |
| `move` | `static` · `pan_left` · `pan_right` · `tilt_up` · `tilt_down` · `push_in` · `pull_out` · `slide` | moving shots are judged on smoothness, not stillness |
| `duration_s` | `[min, max]` seconds | recording stops by itself at `max` |
| `prompter` | text | shown on the teleprompter; empty = silent shot |
| `pillar` | the 6 `content_pillar` values in RAQ OS | optional |
| `reference_image` | `data:image/jpeg;base64,…` or `null` | **links are rejected**; Khaled can also attach a reference photo per shot inside the app |

## Sending a pack as a link
A pack can travel as one link that Khaled taps on WhatsApp. The pack sits after the `#`, which the
browser never sends to any server:

```
https://raq-director.vercel.app/p#1.<base64url of deflate-raw(pack JSON)>
https://raq-director.vercel.app/p#0.<base64url of the pack JSON as UTF-8>
```

- Claude with a shell: `node scripts/pack-link.mjs pack.json` prints the link.
- The brain on claude.ai: use the analysis tool (`CompressionStream("deflate-raw")`, then base64url) or the `0.` form.
  Never type base64 by hand; a wrong character breaks the link. Send the json fence too, as a fallback.
- Over about 30,000 characters some chat apps cut the link; leave `reference_image` out.
- A `project` pack that arrives by link is always locked until Khaled confirms consent on the phone.

## Rules the brain applies before writing a pack
- Brand rules: Dropbox `/RAQ/02_Brand/BR_brand-rules-text_v01_2026-10-03.md` (9:16, best shot first, full wall then details, real RAQ work only).
- No DEC-52 claims, no prices, no offers (DEC-22, DEC-46) in `prompter` text.
- Client homes: `kind: "project"` and `needs_consent: true`; the app will not record until Khaled confirms consent.
- Reference videos from other brands are for framing ideas only; never reuse their footage.
