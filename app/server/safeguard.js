// Deterministic safeguarding screen for community requests (English + Arabic).
// Runs server-side on create and on every edit. AI is never involved in this decision.
const RULES = [
  { code: 'dangerous_equipment', re: /chain\s?saw|power\s?tool|\bdrill\b|angle grinder|nail gun|lawn\s?mower|machete|\bknife\b|\bblades?\b|forklift|\bladders?\b|scaffold|\broof(top)?\b|منشار|مثقاب|آلة حادة|سكين|مقص كهربائي|سلالم|السلم|سقالة|سطح المبنى|جزازة/i },
  { code: 'electrical', re: /electric(al|ian)?\b|wiring|\bwires?\b|soldering|circuit breaker|socket repair|كهرب|أسلاك|تمديدات|لحام/i },
  { code: 'hazardous', re: /chemical|bleach|pesticide|insecticide|asbestos|solvent|\bacid\b|paint thinner|hazardous|toxic|مواد كيميائية|مبيد|مبيدات|حمض|مذيب|مواد سامة|كلور/i },
  { code: 'private_meeting', re: /alone with|one[- ]on[- ]one|private (meeting|session|room)|home alone|unsupervised|no adults?|بمفرده|لقاء خاص|جلسة خاصة|بدون إشراف|دون إشراف|بلا إشراف/i },
  { code: 'unsafe_physical', re: /heavy lifting|demolition|climb(ing)?\b|swimming|\bpool\b|drive me|car ride|lift furniture|رفع الأثقال|أثاث ثقيل|هدم|تسلق|سباحة|مسبح|توصيل بالسيارة/i },
];

export function safeguardCheck(...texts) {
  const hay = texts.filter(Boolean).join(' \n ');
  const hits = [];
  for (const r of RULES) if (r.re.test(hay)) hits.push(r.code);
  return hits;
}

// Fields that, when changed on a live listing, invalidate existing guardian consent.
export const MATERIAL_FIELDS = ['date', 'start_time', 'end_time', 'general_location', 'supervision', 'requirements', 'description', 'category'];
