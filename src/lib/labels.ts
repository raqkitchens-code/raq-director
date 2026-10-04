import type { Framing, Height, Lens, Move, Pillar } from "./types"

export const FRAMING_AR: Record<Framing, string> = {
  wide: "واسعة: المكان كله",
  medium: "متوسطة: جزء من المكان",
  close: "قريبة: وحدة أو تفصيلة",
  detail: "تفصيلة: خامة أو حركة",
}

export const LENS_AR: Record<Lens, string> = {
  "0.6": "العدسة الواسعة ٠٫٦",
  "1": "العدسة الأساسية ١×",
  "2": "تقريب ٢×",
  "3": "عدسة التقريب ٣×",
  front: "الكاميرا الأمامية",
}

export const HEIGHT_AR: Record<Height, string> = {
  floor: "على الأرض",
  knee: "مستوى الركبة",
  waist: "مستوى الوسط",
  chest: "مستوى الصدر",
  eye: "مستوى العين",
  high: "فوق الراس",
}

/** Approximate lens height from the floor, in cm, to make the instruction concrete. */
export const HEIGHT_CM: Record<Height, string> = {
  floor: "١٠ – ٢٠ سم",
  knee: "٤٥ – ٥٥ سم",
  waist: "٩٠ – ١٠٠ سم",
  chest: "١٢٠ – ١٣٥ سم",
  eye: "١٥٠ – ١٦٥ سم",
  high: "١٨٠ سم وأكتر",
}

export const MOVE_AR: Record<Move, string> = {
  static: "ثابت من غير حركة",
  pan_left: "لف بالراحة ناحية الشمال",
  pan_right: "لف بالراحة ناحية اليمين",
  tilt_up: "ارفع الكادر لفوق بالراحة",
  tilt_down: "نزّل الكادر لتحت بالراحة",
  push_in: "قرّب بخطوة بطيئة لقدام",
  pull_out: "ارجع بخطوة بطيئة لورا",
  slide: "اتحرك بالجنب بخط مستقيم",
}

export const PILLAR_AR: Record<Pillar, string> = {
  durability_execution: "العمر والتنفيذ",
  comfort_design: "التصميم بيريحك",
  system_trust: "النظام والثقة",
  real_projects: "مشاريع حقيقية",
  showroom_materials: "المعرض والخامات",
  foundation_mistakes: "غلطات التأسيس",
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
export function arNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)])
}

export function pitchAr(deg: number): string {
  if (Math.abs(deg) < 1) return "مستقيم (موازي للأرض)"
  return deg < 0 ? `باصص لتحت ${arNum(Math.abs(deg))} درجة` : `باصص لفوق ${arNum(deg)} درجة`
}
