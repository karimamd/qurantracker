export interface SurahInfo {
  number: number;
  name: string;
  arabicName: string;
  startPage: number;
  endPage: number;
}

export const TOTAL_PAGES = 604;
export const TOTAL_JUZ = 30;
export const ROB3S_PER_JUZ = 8;
export const TOTAL_ROB3S = TOTAL_JUZ * ROB3S_PER_JUZ;

export const JUZ_PAGE_RANGES: { juz: number; startPage: number; endPage: number }[] = [
  { juz: 1, startPage: 1, endPage: 21 },
  { juz: 2, startPage: 22, endPage: 41 },
  { juz: 3, startPage: 42, endPage: 61 },
  { juz: 4, startPage: 62, endPage: 81 },
  { juz: 5, startPage: 82, endPage: 101 },
  { juz: 6, startPage: 102, endPage: 121 },
  { juz: 7, startPage: 122, endPage: 141 },
  { juz: 8, startPage: 142, endPage: 161 },
  { juz: 9, startPage: 162, endPage: 181 },
  { juz: 10, startPage: 182, endPage: 201 },
  { juz: 11, startPage: 202, endPage: 221 },
  { juz: 12, startPage: 222, endPage: 241 },
  { juz: 13, startPage: 242, endPage: 261 },
  { juz: 14, startPage: 262, endPage: 281 },
  { juz: 15, startPage: 282, endPage: 301 },
  { juz: 16, startPage: 302, endPage: 321 },
  { juz: 17, startPage: 322, endPage: 341 },
  { juz: 18, startPage: 342, endPage: 361 },
  { juz: 19, startPage: 362, endPage: 381 },
  { juz: 20, startPage: 382, endPage: 401 },
  { juz: 21, startPage: 402, endPage: 421 },
  { juz: 22, startPage: 422, endPage: 441 },
  { juz: 23, startPage: 442, endPage: 461 },
  { juz: 24, startPage: 462, endPage: 481 },
  { juz: 25, startPage: 482, endPage: 501 },
  { juz: 26, startPage: 502, endPage: 521 },
  { juz: 27, startPage: 522, endPage: 541 },
  { juz: 28, startPage: 542, endPage: 561 },
  { juz: 29, startPage: 562, endPage: 581 },
  { juz: 30, startPage: 582, endPage: 604 },
];

export const SURAHS: SurahInfo[] = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", startPage: 1, endPage: 1 },
  { number: 2, name: "Al-Baqarah", arabicName: "البقرة", startPage: 2, endPage: 49 },
  { number: 3, name: "Aal-Imran", arabicName: "آل عمران", startPage: 50, endPage: 76 },
  { number: 4, name: "An-Nisa", arabicName: "النساء", startPage: 77, endPage: 106 },
  { number: 5, name: "Al-Maidah", arabicName: "المائدة", startPage: 106, endPage: 127 },
  { number: 6, name: "Al-Anam", arabicName: "الأنعام", startPage: 128, endPage: 150 },
  { number: 7, name: "Al-Araf", arabicName: "الأعراف", startPage: 151, endPage: 176 },
  { number: 8, name: "Al-Anfal", arabicName: "الأنفال", startPage: 177, endPage: 186 },
  { number: 9, name: "At-Tawbah", arabicName: "التوبة", startPage: 187, endPage: 207 },
  { number: 10, name: "Yunus", arabicName: "يونس", startPage: 208, endPage: 221 },
  { number: 11, name: "Hud", arabicName: "هود", startPage: 221, endPage: 235 },
  { number: 12, name: "Yusuf", arabicName: "يوسف", startPage: 235, endPage: 248 },
  { number: 13, name: "Ar-Rad", arabicName: "الرعد", startPage: 249, endPage: 255 },
  { number: 14, name: "Ibrahim", arabicName: "إبراهيم", startPage: 255, endPage: 261 },
  { number: 15, name: "Al-Hijr", arabicName: "الحجر", startPage: 262, endPage: 267 },
  { number: 16, name: "An-Nahl", arabicName: "النحل", startPage: 267, endPage: 281 },
  { number: 17, name: "Al-Isra", arabicName: "الإسراء", startPage: 282, endPage: 293 },
  { number: 18, name: "Al-Kahf", arabicName: "الكهف", startPage: 293, endPage: 304 },
  { number: 19, name: "Maryam", arabicName: "مريم", startPage: 305, endPage: 312 },
  { number: 20, name: "Ta-Ha", arabicName: "طه", startPage: 312, endPage: 321 },
  { number: 21, name: "Al-Anbiya", arabicName: "الأنبياء", startPage: 322, endPage: 331 },
  { number: 22, name: "Al-Hajj", arabicName: "الحج", startPage: 332, endPage: 341 },
  { number: 23, name: "Al-Muminun", arabicName: "المؤمنون", startPage: 342, endPage: 349 },
  { number: 24, name: "An-Nur", arabicName: "النور", startPage: 350, endPage: 359 },
  { number: 25, name: "Al-Furqan", arabicName: "الفرقان", startPage: 359, endPage: 366 },
  { number: 26, name: "Ash-Shuara", arabicName: "الشعراء", startPage: 367, endPage: 376 },
  { number: 27, name: "An-Naml", arabicName: "النمل", startPage: 377, endPage: 385 },
  { number: 28, name: "Al-Qasas", arabicName: "القصص", startPage: 385, endPage: 396 },
  { number: 29, name: "Al-Ankabut", arabicName: "العنكبوت", startPage: 396, endPage: 404 },
  { number: 30, name: "Ar-Rum", arabicName: "الروم", startPage: 404, endPage: 410 },
  { number: 31, name: "Luqman", arabicName: "لقمان", startPage: 411, endPage: 414 },
  { number: 32, name: "As-Sajdah", arabicName: "السجدة", startPage: 415, endPage: 417 },
  { number: 33, name: "Al-Ahzab", arabicName: "الأحزاب", startPage: 418, endPage: 427 },
  { number: 34, name: "Saba", arabicName: "سبأ", startPage: 428, endPage: 434 },
  { number: 35, name: "Fatir", arabicName: "فاطر", startPage: 434, endPage: 440 },
  { number: 36, name: "Ya-Sin", arabicName: "يس", startPage: 440, endPage: 445 },
  { number: 37, name: "As-Saffat", arabicName: "الصافات", startPage: 446, endPage: 452 },
  { number: 38, name: "Sad", arabicName: "ص", startPage: 453, endPage: 458 },
  { number: 39, name: "Az-Zumar", arabicName: "الزمر", startPage: 458, endPage: 467 },
  { number: 40, name: "Ghafir", arabicName: "غافر", startPage: 467, endPage: 476 },
  { number: 41, name: "Fussilat", arabicName: "فصلت", startPage: 477, endPage: 482 },
  { number: 42, name: "Ash-Shura", arabicName: "الشورى", startPage: 483, endPage: 489 },
  { number: 43, name: "Az-Zukhruf", arabicName: "الزخرف", startPage: 489, endPage: 495 },
  { number: 44, name: "Ad-Dukhan", arabicName: "الدخان", startPage: 496, endPage: 498 },
  { number: 45, name: "Al-Jathiyah", arabicName: "الجاثية", startPage: 499, endPage: 502 },
  { number: 46, name: "Al-Ahqaf", arabicName: "الأحقاف", startPage: 502, endPage: 506 },
  { number: 47, name: "Muhammad", arabicName: "محمد", startPage: 507, endPage: 510 },
  { number: 48, name: "Al-Fath", arabicName: "الفتح", startPage: 511, endPage: 515 },
  { number: 49, name: "Al-Hujurat", arabicName: "الحجرات", startPage: 515, endPage: 517 },
  { number: 50, name: "Qaf", arabicName: "ق", startPage: 518, endPage: 520 },
  { number: 51, name: "Adh-Dhariyat", arabicName: "الذاريات", startPage: 520, endPage: 523 },
  { number: 52, name: "At-Tur", arabicName: "الطور", startPage: 523, endPage: 525 },
  { number: 53, name: "An-Najm", arabicName: "النجم", startPage: 526, endPage: 528 },
  { number: 54, name: "Al-Qamar", arabicName: "القمر", startPage: 528, endPage: 531 },
  { number: 55, name: "Ar-Rahman", arabicName: "الرحمن", startPage: 531, endPage: 534 },
  { number: 56, name: "Al-Waqiah", arabicName: "الواقعة", startPage: 534, endPage: 537 },
  { number: 57, name: "Al-Hadid", arabicName: "الحديد", startPage: 537, endPage: 541 },
  { number: 58, name: "Al-Mujadila", arabicName: "المجادلة", startPage: 542, endPage: 545 },
  { number: 59, name: "Al-Hashr", arabicName: "الحشر", startPage: 545, endPage: 548 },
  { number: 60, name: "Al-Mumtahanah", arabicName: "الممتحنة", startPage: 549, endPage: 551 },
  { number: 61, name: "As-Saff", arabicName: "الصف", startPage: 551, endPage: 552 },
  { number: 62, name: "Al-Jumuah", arabicName: "الجمعة", startPage: 553, endPage: 554 },
  { number: 63, name: "Al-Munafiqun", arabicName: "المنافقون", startPage: 554, endPage: 555 },
  { number: 64, name: "At-Taghabun", arabicName: "التغابن", startPage: 556, endPage: 557 },
  { number: 65, name: "At-Talaq", arabicName: "الطلاق", startPage: 558, endPage: 559 },
  { number: 66, name: "At-Tahrim", arabicName: "التحريم", startPage: 560, endPage: 561 },
  { number: 67, name: "Al-Mulk", arabicName: "الملك", startPage: 562, endPage: 564 },
  { number: 68, name: "Al-Qalam", arabicName: "القلم", startPage: 564, endPage: 566 },
  { number: 69, name: "Al-Haqqah", arabicName: "الحاقة", startPage: 566, endPage: 568 },
  { number: 70, name: "Al-Maarij", arabicName: "المعارج", startPage: 568, endPage: 570 },
  { number: 71, name: "Nuh", arabicName: "نوح", startPage: 570, endPage: 571 },
  { number: 72, name: "Al-Jinn", arabicName: "الجن", startPage: 572, endPage: 573 },
  { number: 73, name: "Al-Muzzammil", arabicName: "المزمل", startPage: 574, endPage: 575 },
  { number: 74, name: "Al-Muddaththir", arabicName: "المدثر", startPage: 575, endPage: 577 },
  { number: 75, name: "Al-Qiyamah", arabicName: "القيامة", startPage: 577, endPage: 578 },
  { number: 76, name: "Al-Insan", arabicName: "الإنسان", startPage: 578, endPage: 580 },
  { number: 77, name: "Al-Mursalat", arabicName: "المرسلات", startPage: 580, endPage: 581 },
  { number: 78, name: "An-Naba", arabicName: "النبأ", startPage: 582, endPage: 583 },
  { number: 79, name: "An-Naziat", arabicName: "النازعات", startPage: 583, endPage: 584 },
  { number: 80, name: "Abasa", arabicName: "عبس", startPage: 585, endPage: 585 },
  { number: 81, name: "At-Takwir", arabicName: "التكوير", startPage: 586, endPage: 586 },
  { number: 82, name: "Al-Infitar", arabicName: "الانفطار", startPage: 587, endPage: 587 },
  { number: 83, name: "Al-Mutaffifin", arabicName: "المطففين", startPage: 587, endPage: 589 },
  { number: 84, name: "Al-Inshiqaq", arabicName: "الانشقاق", startPage: 589, endPage: 589 },
  { number: 85, name: "Al-Buruj", arabicName: "البروج", startPage: 590, endPage: 590 },
  { number: 86, name: "At-Tariq", arabicName: "الطارق", startPage: 591, endPage: 591 },
  { number: 87, name: "Al-Ala", arabicName: "الأعلى", startPage: 591, endPage: 592 },
  { number: 88, name: "Al-Ghashiyah", arabicName: "الغاشية", startPage: 592, endPage: 592 },
  { number: 89, name: "Al-Fajr", arabicName: "الفجر", startPage: 593, endPage: 594 },
  { number: 90, name: "Al-Balad", arabicName: "البلد", startPage: 594, endPage: 594 },
  { number: 91, name: "Ash-Shams", arabicName: "الشمس", startPage: 595, endPage: 595 },
  { number: 92, name: "Al-Layl", arabicName: "الليل", startPage: 595, endPage: 596 },
  { number: 93, name: "Ad-Duha", arabicName: "الضحى", startPage: 596, endPage: 596 },
  { number: 94, name: "Ash-Sharh", arabicName: "الشرح", startPage: 596, endPage: 596 },
  { number: 95, name: "At-Tin", arabicName: "التين", startPage: 597, endPage: 597 },
  { number: 96, name: "Al-Alaq", arabicName: "العلق", startPage: 597, endPage: 597 },
  { number: 97, name: "Al-Qadr", arabicName: "القدر", startPage: 598, endPage: 598 },
  { number: 98, name: "Al-Bayyinah", arabicName: "البينة", startPage: 598, endPage: 599 },
  { number: 99, name: "Az-Zalzalah", arabicName: "الزلزلة", startPage: 599, endPage: 599 },
  { number: 100, name: "Al-Adiyat", arabicName: "العاديات", startPage: 599, endPage: 600 },
  { number: 101, name: "Al-Qariah", arabicName: "القارعة", startPage: 600, endPage: 600 },
  { number: 102, name: "At-Takathur", arabicName: "التكاثر", startPage: 600, endPage: 600 },
  { number: 103, name: "Al-Asr", arabicName: "العصر", startPage: 601, endPage: 601 },
  { number: 104, name: "Al-Humazah", arabicName: "الهمزة", startPage: 601, endPage: 601 },
  { number: 105, name: "Al-Fil", arabicName: "الفيل", startPage: 601, endPage: 601 },
  { number: 106, name: "Quraysh", arabicName: "قريش", startPage: 602, endPage: 602 },
  { number: 107, name: "Al-Maun", arabicName: "الماعون", startPage: 602, endPage: 602 },
  { number: 108, name: "Al-Kawthar", arabicName: "الكوثر", startPage: 602, endPage: 602 },
  { number: 109, name: "Al-Kafirun", arabicName: "الكافرون", startPage: 603, endPage: 603 },
  { number: 110, name: "An-Nasr", arabicName: "النصر", startPage: 603, endPage: 603 },
  { number: 111, name: "Al-Masad", arabicName: "المسد", startPage: 603, endPage: 603 },
  { number: 112, name: "Al-Ikhlas", arabicName: "الإخلاص", startPage: 604, endPage: 604 },
  { number: 113, name: "Al-Falaq", arabicName: "الفلق", startPage: 604, endPage: 604 },
  { number: 114, name: "An-Nas", arabicName: "الناس", startPage: 604, endPage: 604 },
];

export function getJuzForPage(pageNumber: number): number {
  const juz = JUZ_PAGE_RANGES.find(j => pageNumber >= j.startPage && pageNumber <= j.endPage);
  return juz ? juz.juz : 1;
}

import rob3BoundariesData from "./rob3-boundaries.json";

interface Rob3Boundary {
  rob3: number;
  surah: number;
  ayah: number;
  page: number;
}

const ROB3_BOUNDARIES = rob3BoundariesData as Rob3Boundary[];

export function getRob3ForPage(pageNumber: number): number {
  // Find the highest rob3 whose start page is <= pageNumber.
  let result = 1;
  for (const b of ROB3_BOUNDARIES) {
    if (b.page <= pageNumber) result = b.rob3;
    else break;
  }
  return result;
}

export function getRob3Range(rob3Number: number): {
  startPage: number;
  endPage: number;
  juzNumber: number;
  startSurah: number;
  startAyah: number;
} {
  const boundary = ROB3_BOUNDARIES[rob3Number - 1];
  const next = ROB3_BOUNDARIES[rob3Number];
  const juzNumber = Math.floor((rob3Number - 1) / ROB3S_PER_JUZ) + 1;
  if (!boundary) return { startPage: 1, endPage: 1, juzNumber: 1, startSurah: 1, startAyah: 1 };
  const startPage = boundary.page;
  const endPage = next ? Math.max(startPage, next.page - 1) : TOTAL_PAGES;
  return { startPage, endPage, juzNumber, startSurah: boundary.surah, startAyah: boundary.ayah };
}

export function getSurahsForPage(pageNumber: number): string {
  const surahs = SURAHS.filter(s => pageNumber >= s.startPage && pageNumber <= s.endPage);
  return surahs.map(s => s.name).join(", ") || "Unknown";
}

export function getJuzName(juzNumber: number): string {
  return `Juz ${juzNumber}`;
}
