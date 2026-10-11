/**
 * Built-in RAQ shot lists. Grounded in the brand rules text
 * (Dropbox /RAQ/02_Brand/BR_brand-rules-text_v01_2026-10-03.md):
 * full wall first, then close on material and details (§6), 9:16 video,
 * the best shot in the first 3 seconds (§7), real RAQ work only, no DEC-52 claims.
 */
import { PACK_FORMAT, type Shot, type ShootPack } from "./types"

type S = Omit<Shot, "pitch_tol" | "roll_tol"> & Partial<Pick<Shot, "pitch_tol" | "roll_tol">>

const base = (s: S): Shot => ({ pitch_tol: 4, roll_tol: 2, ...s })

export const LIBRARY_PACK: ShootPack = {
  format: PACK_FORMAT,
  id: "LIB-RAQ-01",
  title: "مكتبة لقطات راق العامة",
  kind: "library",
  project_code: null,
  consent_confirmed: true,
  notes: "لقطات في المعرض والورشة بس. أي بيت عميل له خطة مشروع لوحده بموافقته.",
  created_at: "2026-10-04T00:00:00Z",
  shots: [
    base({
      id: "L01", title: "مدخل المعرض والقوس", pillar: "showroom_materials",
      purpose: "أول لقطة في أي فيديو عن المعرض: القوس = مدخل البيت",
      framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "push_in", duration_s: [4, 7],
      direction: "ابدأ من برّه الباب وادخل بخطوة بطيئة ثابتة. الخطوط الرأسية لازم تبقى مستقيمة.",
    }),
    base({
      id: "L02", title: "حيطة مطبخ كاملة في المعرض", pillar: "comfort_design",
      purpose: "الحيطة كاملة قبل أي تفصيلة",
      framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 5],
      direction: "قف في نص الحيطة بالظبط. شيل أي كراكيب من الكادر قبل التصوير.",
    }),
    base({
      id: "L03", title: "درج بيقفل لوحده بهدوء", pillar: "durability_execution",
      purpose: "الإحساس بالجودة في الاستخدام اليومي",
      framing: "detail", lens: "1", height: "waist", pitch_deg: -20, move: "static", duration_s: [3, 6],
      direction: "افتح الدرج للآخر قبل ما تبدأ، وبعدها زقّه زقة خفيفة وسيبه يقفل لوحده.",
    }),
    base({
      id: "L04", title: "مفصلة ضلفة وهي بتقفل", pillar: "durability_execution",
      framing: "detail", lens: "2", height: "waist", pitch_deg: -10, move: "static", duration_s: [3, 5],
      direction: "الضلفة مفتوحة نصها، والمفصلة في تلت الكادر. اقفلها بإيدك بالراحة.",
    }),
    base({
      id: "L05", title: "لمسة على خامة الضلفة", pillar: "showroom_materials",
      purpose: "الخامة الحقيقية من قريب: من غير فلتر يغيّر لون الخشب",
      framing: "detail", lens: "2", height: "chest", pitch_deg: -5, move: "slide", duration_s: [3, 6],
      direction: "نور طبيعي مايل من الجنب. إيد بتعدي على الضلفة بالراحة.",
    }),
    base({
      id: "L06", title: "حرف الضلفة والتقفيل", pillar: "durability_execution",
      framing: "detail", lens: "3", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 5],
      direction: "قرّب على الحرف لحد ما التقفيل يبان واضح. الفوكس على الحرف مش على الخلفية.",
    }),
    base({
      id: "L07", title: "التخزين الطويل من جوه", pillar: "comfort_design",
      framing: "medium", lens: "1", height: "chest", pitch_deg: 0, move: "tilt_down", duration_s: [4, 7],
      direction: "افتح الوحدة الطويلة كلها، وابدأ من فوق وانزل بالراحة لحد تحت.",
    }),
    base({
      id: "L08", title: "مسافة البوتاجاز والحوض", pillar: "comfort_design",
      purpose: "التصميم بيريحك في الشغل اليومي",
      framing: "medium", lens: "0.6", height: "high", pitch_deg: -35, move: "static", duration_s: [3, 6],
      direction: "صوّر من فوق كتفك كأنك واقف بتطبخ. البوتاجاز والحوض الاتنين في الكادر.",
    }),
    base({
      id: "L09", title: "عينات الخامات على الترابيزة", pillar: "showroom_materials",
      framing: "close", lens: "1", height: "high", pitch_deg: -70, move: "slide", duration_s: [4, 7],
      direction: "رتّب العينات صف واحد. الموبايل فوقها تقريبًا وامشي بالجنب بخط مستقيم.",
    }),
    base({
      id: "L10", title: "تصميم ثلاثي الأبعاد على الشاشة", pillar: "system_trust",
      purpose: "شوف مكانك قبل ما يتنفّذ",
      framing: "medium", lens: "1", height: "chest", pitch_deg: -10, move: "push_in", duration_s: [4, 7],
      direction: "الشاشة عليها التصميم ومكتوب «تصميم». ممنوع يبان أي اسم أو رقم عميل على الشاشة.",
    }),
    base({
      id: "L11", title: "متر القياس على الحيطة", pillar: "foundation_mistakes",
      purpose: "مقاسات قبل التصنيع",
      framing: "close", lens: "1", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 5],
      direction: "في المعرض أو الورشة بس. شد المتر على الحيطة والأرقام باينة.",
    }),
    base({
      id: "L12", title: "إضاءة تحت الوحدات العلوية", pillar: "comfort_design",
      framing: "medium", lens: "1", height: "chest", pitch_deg: 5, move: "static", duration_s: [3, 5],
      direction: "طفّي نور الأوضة الأول، وبعدها شغّل الإضاءة وانت بتصوّر.",
    }),
    base({
      id: "L13", title: "خالد بيتكلم للكاميرا", pillar: "system_trust",
      framing: "medium", lens: "front", height: "eye", pitch_deg: 0, move: "static", duration_s: [8, 45],
      prompter: "",
      direction: "الكاميرا على مستوى العين، والمطبخ ورا. اكتب الكلام في الملقّن قبل ما تبدأ.",
    }),
  ],
}

/** Starting template for a client project tour, used until the brain sends a tailored pack. */
export function projectTourPack(projectCode: string, consent: boolean, notes: string): ShootPack {
  const p = (s: S): Shot => ({ ...base(s), pillar: "real_projects", needs_consent: true })
  return {
    format: PACK_FORMAT,
    id: `TOUR-${projectCode}-${Date.now().toString(36)}`,
    title: `جولة مشروع ${projectCode}`,
    kind: "project",
    project_code: projectCode,
    consent_confirmed: consent,
    notes: notes || "قالب جولة مشروع. اطلب من العقل خطة مخصوصة لو المشروع له حكاية معينة.",
    created_at: new Date().toISOString(),
    shots: [
      p({ id: "P01", title: "أجمل لقطة: المطبخ كله", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "push_in", duration_s: [3, 5], direction: "دي أول ٣ ثواني في الفيديو. نوّر المكان كله وشيل أي حاجة شخصية للعميل." }),
      p({ id: "P02", title: "الحيطة الأساسية مستقيمة", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 5], direction: "في نص الحيطة بالظبط، والخطوط الرأسية مستقيمة." }),
      p({ id: "P03", title: "الركنة", framing: "medium", lens: "1", height: "chest", pitch_deg: -5, move: "pan_left", duration_s: [4, 6], direction: "لف بالراحة من حيطة لحيطة عبر الركنة." }),
      p({ id: "P04", title: "درج بيقفل", framing: "detail", lens: "1", height: "waist", pitch_deg: -20, move: "static", duration_s: [3, 5] }),
      p({ id: "P05", title: "الخامة من قريب", framing: "detail", lens: "2", height: "chest", pitch_deg: -5, move: "slide", duration_s: [3, 5], direction: "نور طبيعي، ومن غير فلتر يغيّر اللون." }),
      p({ id: "P06", title: "التخزين من جوه", framing: "medium", lens: "1", height: "chest", pitch_deg: 0, move: "tilt_down", duration_s: [4, 6] }),
      p({ id: "P07", title: "الإضاءة", framing: "medium", lens: "1", height: "chest", pitch_deg: 5, move: "static", duration_s: [3, 5] }),
      p({ id: "P08", title: "لقطة الختام", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "pull_out", duration_s: [4, 6], direction: "ارجع لورا بالراحة لحد ما المكان كله يبان." }),
    ],
  }
}

/** Turns a pasted script into talking shots: one paragraph = one shot on the teleprompter. */
export function scriptPack(title: string, script: string, lens: "front" | "1" = "front"): ShootPack {
  const parts = script
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 40)
  return {
    format: PACK_FORMAT,
    id: `SCR-${Date.now().toString(36)}`,
    title: title || "فيديو بسكريبت",
    kind: "script",
    project_code: null,
    consent_confirmed: true,
    created_at: new Date().toISOString(),
    shots: parts.map((text, i) => {
      const words = text.split(/\s+/).length
      // Egyptian Arabic on camera runs at roughly 2 words per second.
      const est = Math.max(3, Math.round(words / 2))
      return base({
        id: `T${String(i + 1).padStart(2, "0")}`,
        title: `مقطع ${i + 1}`,
        framing: "medium",
        lens,
        height: "eye",
        pitch_deg: 0,
        move: "static",
        duration_s: [Math.max(2, Math.round(est * 0.7)), Math.round(est * 1.6) + 2],
        prompter: text,
        direction: "بص في العدسة، مش في الشاشة. اقرا من الملقّن بهدوء.",
      })
    }),
  }
}

/**
 * «معاينة»: the site visit before design. The footage is the team's record of the room
 * (walls, openings, water, drain, gas, power, ceiling, floor, access), checked against
 * the survey form and the planner. Not for publishing.
 */
export function surveyPack(projectCode: string, consent: boolean, notes: string): ShootPack {
  const p = (s: S): Shot => ({ ...base(s), needs_consent: true })
  return {
    format: PACK_FORMAT,
    id: `SURVEY-${projectCode}-${Date.now().toString(36)}`,
    title: `معاينة ${projectCode}`,
    kind: "project",
    project_code: projectCode,
    consent_confirmed: consent,
    notes:
      notes ||
      "تصوير المعاينة للفريق بس، مش للنشر. المتر يبان في كل لقطة فيها مقاس، وقول بصوتك اسم الحيطة والرقم وانت بتصوّر.",
    created_at: new Date().toISOString(),
    shots: [
      p({ id: "M01", title: "المكان كله من الباب", purpose: "شكل المكان قبل أي شغل، ونفس المكان هيتصوّر تاني يوم التسليم", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 6], direction: "قف على عتبة الباب بالظبط وعلّم مكان رجلك. يوم التسليم هنقف في نفس المكان." }),
      p({ id: "M02", title: "لفة كاملة بالراحة", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "pan_right", duration_s: [8, 15], direction: "من نص المكان لف لفة كاملة ببطء، من غير ما توقف." }),
      p({ id: "M03", title: "كل حيطة لوحدها", purpose: "الحيطان اللي هيتركب عليها", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [4, 8], direction: "صوّر كل حيطة من الحيطة اللي قصادها، والخطوط الرأسية مستقيمة. قول اسمها: حيطة الشباك، حيطة الباب… خد لقطة لكل حيطة." }),
      p({ id: "M04", title: "الشباك والباب بالمتر", framing: "medium", lens: "1", height: "chest", pitch_deg: 0, move: "static", duration_s: [4, 8], direction: "المتر مشدود على العرض وبعدين الارتفاع، والأرقام باينة. وكمان المسافة من الأرض لحد الشباك." }),
      p({ id: "M05", title: "الصرف ومحابس المية", framing: "close", lens: "1", height: "knee", pitch_deg: -45, move: "static", duration_s: [3, 6], direction: "مكان الصرف والمحابس، والمتر من الركنة ومن الأرض." }),
      p({ id: "M06", title: "الغاز ومكان البوتاجاز", framing: "close", lens: "1", height: "waist", pitch_deg: -20, move: "static", duration_s: [3, 6], direction: "خط الغاز أو مكان الأنبوبة، والمسافة من أقرب ركنة." }),
      p({ id: "M07", title: "الكهربا: البرايز والمفاتيح", framing: "medium", lens: "1", height: "chest", pitch_deg: 0, move: "slide", duration_s: [5, 10], direction: "امشي على الحيطان وصوّر كل بريزة ومفتاح، ولوحة الكهربا لو قريبة." }),
      p({ id: "M08", title: "السقف والكمرات", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 30, move: "tilt_up", duration_s: [4, 8], direction: "ابدأ من الأرض واطلع للسقف بالراحة. صوّر المتر من الأرض للسقف وتحت أي كمرة." }),
      p({ id: "M09", title: "الأعمدة والبروزات والزوايا", framing: "close", lens: "1", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 6], direction: "أي عمود أو بروز أو زاوية مش قايمة، بالمتر." }),
      p({ id: "M10", title: "الأرضية", framing: "close", lens: "1", height: "high", pitch_deg: -60, move: "slide", duration_s: [4, 8], direction: "نوع الأرضية، وأي ميل أو فرق منسوب. لو معاك ميزان مية حطه وصوّره." }),
      p({ id: "M11", title: "العيوب: رطوبة وشروخ", purpose: "نتفق عليها قبل التصنيع", framing: "close", lens: "1", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 6], direction: "أي رطوبة أو شرخ أو حيطة مش مستقيمة. لو مفيش، صوّر الحيطة اللي ورا مكان الحوض." }),
      p({ id: "M12", title: "المدخل والسلم والأسانسير", purpose: "طريق الوحدات يوم التركيب", framing: "medium", lens: "0.6", height: "chest", pitch_deg: 0, move: "push_in", duration_s: [4, 8], direction: "من باب العمارة لحد باب الشقة: عرض السلم والأسانسير وأي لفة ضيقة." }),
    ],
  }
}

/**
 * «تسليم»: handover day. A full record of the finished work for the client file,
 * plus the best shots for publishing once the client agrees (DEC-51).
 */
export function handoverPack(projectCode: string, consent: boolean, notes: string): ShootPack {
  const p = (s: S): Shot => ({ ...base(s), pillar: "real_projects", needs_consent: true })
  return {
    format: PACK_FORMAT,
    id: `HANDOVER-${projectCode}-${Date.now().toString(36)}`,
    title: `تسليم ${projectCode}`,
    kind: "project",
    project_code: projectCode,
    consent_confirmed: consent,
    notes:
      notes ||
      "قبل التصوير: المطبخ نضيف، والحماية والكراتين برّه، وكل النور شغال، ومفيش حاجة شخصية للعميل في الكادر.",
    created_at: new Date().toISOString(),
    shots: [
      p({ id: "H01", title: "أجمل لقطة: المطبخ كله", purpose: "أول ٣ ثواني في الفيديو", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "push_in", duration_s: [3, 5], direction: "نوّر المكان كله وادخل بخطوة بطيئة ثابتة." }),
      p({ id: "H02", title: "قبل وبعد: من مكان المعاينة", purpose: "نفس كادر أول لقطة في المعاينة", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 6], direction: "قف في نفس المكان اللي صوّرت منه أول لقطة يوم المعاينة. حط صورة منها كمرجع لو معاك." }),
      p({ id: "H03", title: "كل حيطة مستقيمة", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "static", duration_s: [3, 5], direction: "في نص كل حيطة بالظبط، والخطوط الرأسية مستقيمة. لقطة لكل حيطة." }),
      p({ id: "H04", title: "الركنة", framing: "medium", lens: "1", height: "chest", pitch_deg: -5, move: "pan_left", duration_s: [4, 6], direction: "لف بالراحة من حيطة لحيطة عبر الركنة." }),
      p({ id: "H05", title: "درج بيقفل لوحده", framing: "detail", lens: "1", height: "waist", pitch_deg: -20, move: "static", duration_s: [3, 5], direction: "افتح الدرج للآخر، وزقّه زقة خفيفة وسيبه يقفل لوحده." }),
      p({ id: "H06", title: "الخامة والتقفيل من قريب", framing: "detail", lens: "2", height: "chest", pitch_deg: -5, move: "slide", duration_s: [3, 5], direction: "نور طبيعي، ومن غير فلتر يغيّر اللون. الفوكس على الحرف." }),
      p({ id: "H07", title: "التخزين من جوه", framing: "medium", lens: "1", height: "chest", pitch_deg: 0, move: "tilt_down", duration_s: [4, 6], direction: "افتح الوحدة الطويلة كلها، وابدأ من فوق وانزل بالراحة." }),
      p({ id: "H08", title: "الإضاءة وهي بتنوّر", framing: "medium", lens: "1", height: "chest", pitch_deg: 5, move: "static", duration_s: [3, 5], direction: "طفّي نور الأوضة، وبعدها شغّل إضاءة الوحدات وانت بتصوّر." }),
      p({ id: "H09", title: "الأجهزة في مكانها", framing: "medium", lens: "1", height: "chest", pitch_deg: -10, move: "slide", duration_s: [4, 6], direction: "الحوض والبوتاجاز والشفاط والفرن، كل واحد في مكانه ومتركّب." }),
      p({ id: "H10", title: "العميل بيفتح أول درج", framing: "medium", lens: "1", height: "chest", pitch_deg: -10, move: "static", duration_s: [3, 6], direction: "إيد العميل بس، أو وشه لو وافق إنه يظهر." }),
      p({ id: "H11", title: "كلمة العميل", purpose: "رأي حقيقي بكلامه هو", framing: "medium", lens: "1", height: "eye", pitch_deg: 0, move: "static", duration_s: [8, 40], direction: "لو وافق يظهر بس. اسأله سؤال واحد: «إيه أكتر حاجة عجبتك؟» وسيبه يتكلم من غير تلقين." }),
      p({ id: "H12", title: "لقطة الختام", framing: "wide", lens: "0.6", height: "chest", pitch_deg: 0, move: "pull_out", duration_s: [4, 6], direction: "ارجع لورا بالراحة لحد ما المكان كله يبان." }),
    ],
  }
}
