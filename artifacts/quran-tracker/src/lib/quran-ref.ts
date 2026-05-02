export const JUZ_RANGES = [
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
] as const;

export const SURAHS = [
  { number: 1, name: "Al-Fatiha", arabic: "الفاتحة", startPage: 1, endPage: 1 },
  { number: 2, name: "Al-Baqarah", arabic: "البقرة", startPage: 2, endPage: 49 },
  { number: 3, name: "Aal-Imran", arabic: "آل عمران", startPage: 50, endPage: 76 },
  { number: 4, name: "An-Nisa", arabic: "النساء", startPage: 77, endPage: 106 },
  { number: 5, name: "Al-Maidah", arabic: "المائدة", startPage: 106, endPage: 127 },
  { number: 6, name: "Al-Anam", arabic: "الأنعام", startPage: 128, endPage: 150 },
  { number: 7, name: "Al-Araf", arabic: "الأعراف", startPage: 151, endPage: 176 },
  { number: 8, name: "Al-Anfal", arabic: "الأنفال", startPage: 177, endPage: 186 },
  { number: 9, name: "At-Tawbah", arabic: "التوبة", startPage: 187, endPage: 207 },
  { number: 10, name: "Yunus", arabic: "يونس", startPage: 208, endPage: 221 },
  { number: 11, name: "Hud", arabic: "هود", startPage: 221, endPage: 235 },
  { number: 12, name: "Yusuf", arabic: "يوسف", startPage: 235, endPage: 248 },
  { number: 13, name: "Ar-Rad", arabic: "الرعد", startPage: 249, endPage: 255 },
  { number: 14, name: "Ibrahim", arabic: "إبراهيم", startPage: 255, endPage: 261 },
  { number: 15, name: "Al-Hijr", arabic: "الحجر", startPage: 262, endPage: 267 },
  { number: 16, name: "An-Nahl", arabic: "النحل", startPage: 267, endPage: 281 },
  { number: 17, name: "Al-Isra", arabic: "الإسراء", startPage: 282, endPage: 293 },
  { number: 18, name: "Al-Kahf", arabic: "الكهف", startPage: 293, endPage: 304 },
  { number: 19, name: "Maryam", arabic: "مريم", startPage: 305, endPage: 312 },
  { number: 20, name: "Ta-Ha", arabic: "طه", startPage: 312, endPage: 321 },
  { number: 21, name: "Al-Anbiya", arabic: "الأنبياء", startPage: 322, endPage: 331 },
  { number: 22, name: "Al-Hajj", arabic: "الحج", startPage: 332, endPage: 341 },
  { number: 23, name: "Al-Muminun", arabic: "المؤمنون", startPage: 342, endPage: 349 },
  { number: 24, name: "An-Nur", arabic: "النور", startPage: 350, endPage: 359 },
  { number: 25, name: "Al-Furqan", arabic: "الفرقان", startPage: 359, endPage: 366 },
  { number: 26, name: "Ash-Shuara", arabic: "الشعراء", startPage: 367, endPage: 376 },
  { number: 27, name: "An-Naml", arabic: "النمل", startPage: 377, endPage: 385 },
  { number: 28, name: "Al-Qasas", arabic: "القصص", startPage: 385, endPage: 396 },
  { number: 29, name: "Al-Ankabut", arabic: "العنكبوت", startPage: 396, endPage: 404 },
  { number: 30, name: "Ar-Rum", arabic: "الروم", startPage: 404, endPage: 410 },
  { number: 31, name: "Luqman", arabic: "لقمان", startPage: 411, endPage: 414 },
  { number: 32, name: "As-Sajdah", arabic: "السجدة", startPage: 415, endPage: 417 },
  { number: 33, name: "Al-Ahzab", arabic: "الأحزاب", startPage: 418, endPage: 427 },
  { number: 34, name: "Saba", arabic: "سبأ", startPage: 428, endPage: 434 },
  { number: 35, name: "Fatir", arabic: "فاطر", startPage: 434, endPage: 440 },
  { number: 36, name: "Ya-Sin", arabic: "يس", startPage: 440, endPage: 445 },
  { number: 37, name: "As-Saffat", arabic: "الصافات", startPage: 446, endPage: 452 },
  { number: 38, name: "Sad", arabic: "ص", startPage: 453, endPage: 458 },
  { number: 39, name: "Az-Zumar", arabic: "الزمر", startPage: 458, endPage: 467 },
  { number: 40, name: "Ghafir", arabic: "غافر", startPage: 467, endPage: 476 },
  { number: 41, name: "Fussilat", arabic: "فصلت", startPage: 477, endPage: 482 },
  { number: 42, name: "Ash-Shura", arabic: "الشورى", startPage: 483, endPage: 489 },
  { number: 43, name: "Az-Zukhruf", arabic: "الزخرف", startPage: 489, endPage: 495 },
  { number: 44, name: "Ad-Dukhan", arabic: "الدخان", startPage: 496, endPage: 498 },
  { number: 45, name: "Al-Jathiyah", arabic: "الجاثية", startPage: 499, endPage: 502 },
  { number: 46, name: "Al-Ahqaf", arabic: "الأحقاف", startPage: 502, endPage: 506 },
  { number: 47, name: "Muhammad", arabic: "محمد", startPage: 507, endPage: 510 },
  { number: 48, name: "Al-Fath", arabic: "الفتح", startPage: 511, endPage: 515 },
  { number: 49, name: "Al-Hujurat", arabic: "الحجرات", startPage: 515, endPage: 517 },
  { number: 50, name: "Qaf", arabic: "ق", startPage: 518, endPage: 520 },
  { number: 51, name: "Adh-Dhariyat", arabic: "الذاريات", startPage: 520, endPage: 523 },
  { number: 52, name: "At-Tur", arabic: "الطور", startPage: 523, endPage: 525 },
  { number: 53, name: "An-Najm", arabic: "النجم", startPage: 526, endPage: 528 },
  { number: 54, name: "Al-Qamar", arabic: "القمر", startPage: 528, endPage: 531 },
  { number: 55, name: "Ar-Rahman", arabic: "الرحمن", startPage: 531, endPage: 534 },
  { number: 56, name: "Al-Waqiah", arabic: "الواقعة", startPage: 534, endPage: 537 },
  { number: 57, name: "Al-Hadid", arabic: "الحديد", startPage: 537, endPage: 541 },
  { number: 58, name: "Al-Mujadila", arabic: "المجادلة", startPage: 542, endPage: 545 },
  { number: 59, name: "Al-Hashr", arabic: "الحشر", startPage: 545, endPage: 548 },
  { number: 60, name: "Al-Mumtahanah", arabic: "الممتحنة", startPage: 549, endPage: 551 },
  { number: 61, name: "As-Saff", arabic: "الصف", startPage: 551, endPage: 552 },
  { number: 62, name: "Al-Jumuah", arabic: "الجمعة", startPage: 553, endPage: 554 },
  { number: 63, name: "Al-Munafiqun", arabic: "المنافقون", startPage: 554, endPage: 555 },
  { number: 64, name: "At-Taghabun", arabic: "التغابن", startPage: 556, endPage: 557 },
  { number: 65, name: "At-Talaq", arabic: "الطلاق", startPage: 558, endPage: 559 },
  { number: 66, name: "At-Tahrim", arabic: "التحريم", startPage: 560, endPage: 561 },
  { number: 67, name: "Al-Mulk", arabic: "الملك", startPage: 562, endPage: 564 },
  { number: 68, name: "Al-Qalam", arabic: "القلم", startPage: 564, endPage: 566 },
  { number: 69, name: "Al-Haqqah", arabic: "الحاقة", startPage: 566, endPage: 568 },
  { number: 70, name: "Al-Maarij", arabic: "المعارج", startPage: 568, endPage: 570 },
  { number: 71, name: "Nuh", arabic: "نوح", startPage: 570, endPage: 571 },
  { number: 72, name: "Al-Jinn", arabic: "الجن", startPage: 572, endPage: 573 },
  { number: 73, name: "Al-Muzzammil", arabic: "المزمل", startPage: 574, endPage: 575 },
  { number: 74, name: "Al-Muddaththir", arabic: "المدثر", startPage: 575, endPage: 577 },
  { number: 75, name: "Al-Qiyamah", arabic: "القيامة", startPage: 577, endPage: 578 },
  { number: 76, name: "Al-Insan", arabic: "الإنسان", startPage: 578, endPage: 580 },
  { number: 77, name: "Al-Mursalat", arabic: "المرسلات", startPage: 580, endPage: 581 },
  { number: 78, name: "An-Naba", arabic: "النبأ", startPage: 582, endPage: 583 },
  { number: 79, name: "An-Naziat", arabic: "النازعات", startPage: 583, endPage: 584 },
  { number: 80, name: "Abasa", arabic: "عبس", startPage: 585, endPage: 585 },
  { number: 81, name: "At-Takwir", arabic: "التكوير", startPage: 586, endPage: 586 },
  { number: 82, name: "Al-Infitar", arabic: "الانفطار", startPage: 587, endPage: 587 },
  { number: 83, name: "Al-Mutaffifin", arabic: "المطففين", startPage: 587, endPage: 589 },
  { number: 84, name: "Al-Inshiqaq", arabic: "الانشقاق", startPage: 589, endPage: 589 },
  { number: 85, name: "Al-Buruj", arabic: "البروج", startPage: 590, endPage: 590 },
  { number: 86, name: "At-Tariq", arabic: "الطارق", startPage: 591, endPage: 591 },
  { number: 87, name: "Al-Ala", arabic: "الأعلى", startPage: 591, endPage: 592 },
  { number: 88, name: "Al-Ghashiyah", arabic: "الغاشية", startPage: 592, endPage: 592 },
  { number: 89, name: "Al-Fajr", arabic: "الفجر", startPage: 593, endPage: 594 },
  { number: 90, name: "Al-Balad", arabic: "البلد", startPage: 594, endPage: 594 },
  { number: 91, name: "Ash-Shams", arabic: "الشمس", startPage: 595, endPage: 595 },
  { number: 92, name: "Al-Layl", arabic: "الليل", startPage: 595, endPage: 596 },
  { number: 93, name: "Ad-Duha", arabic: "الضحى", startPage: 596, endPage: 596 },
  { number: 94, name: "Ash-Sharh", arabic: "الشرح", startPage: 596, endPage: 596 },
  { number: 95, name: "At-Tin", arabic: "التين", startPage: 597, endPage: 597 },
  { number: 96, name: "Al-Alaq", arabic: "العلق", startPage: 597, endPage: 597 },
  { number: 97, name: "Al-Qadr", arabic: "القدر", startPage: 598, endPage: 598 },
  { number: 98, name: "Al-Bayyinah", arabic: "البينة", startPage: 598, endPage: 599 },
  { number: 99, name: "Az-Zalzalah", arabic: "الزلزلة", startPage: 599, endPage: 599 },
  { number: 100, name: "Al-Adiyat", arabic: "العاديات", startPage: 599, endPage: 600 },
  { number: 101, name: "Al-Qariah", arabic: "القارعة", startPage: 600, endPage: 600 },
  { number: 102, name: "At-Takathur", arabic: "التكاثر", startPage: 600, endPage: 600 },
  { number: 103, name: "Al-Asr", arabic: "العصر", startPage: 601, endPage: 601 },
  { number: 104, name: "Al-Humazah", arabic: "الهمزة", startPage: 601, endPage: 601 },
  { number: 105, name: "Al-Fil", arabic: "الفيل", startPage: 601, endPage: 601 },
  { number: 106, name: "Quraysh", arabic: "قريش", startPage: 602, endPage: 602 },
  { number: 107, name: "Al-Maun", arabic: "الماعون", startPage: 602, endPage: 602 },
  { number: 108, name: "Al-Kawthar", arabic: "الكوثر", startPage: 602, endPage: 602 },
  { number: 109, name: "Al-Kafirun", arabic: "الكافرون", startPage: 603, endPage: 603 },
  { number: 110, name: "An-Nasr", arabic: "النصر", startPage: 603, endPage: 603 },
  { number: 111, name: "Al-Masad", arabic: "المسد", startPage: 603, endPage: 603 },
  { number: 112, name: "Al-Ikhlas", arabic: "الإخلاص", startPage: 604, endPage: 604 },
  { number: 113, name: "Al-Falaq", arabic: "الفلق", startPage: 604, endPage: 604 },
  { number: 114, name: "An-Nas", arabic: "الناس", startPage: 604, endPage: 604 },
];

export function pagesForJuz(juz: number): number[] {
  const entry = JUZ_RANGES.find(j => j.juz === juz);
  if (!entry) return [];
  return Array.from({ length: entry.endPage - entry.startPage + 1 }, (_, i) => entry.startPage + i);
}

export function getSurahsInPageRange(
  startPage: number,
  endPage: number,
): typeof SURAHS[number][] {
  return SURAHS.filter(s => s.startPage <= endPage && s.endPage >= startPage);
}

export function pagesForSurah(surahNumber: number): number[] {
  const s = SURAHS.find(s => s.number === surahNumber);
  if (!s) return [];
  return Array.from({ length: s.endPage - s.startPage + 1 }, (_, i) => s.startPage + i);
}

export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ROB3S_PER_JUZ = 8;
export const TOTAL_ROB3S = JUZ_RANGES.length * ROB3S_PER_JUZ;

export interface Rob3Range {
  rob3: number;
  rob3InJuz: number;
  juz: number;
  startPage: number;
  endPage: number;
}

export function getRob3Range(rob3Number: number): Rob3Range {
  const juzIndex = Math.floor((rob3Number - 1) / ROB3S_PER_JUZ);
  const rob3InJuz = (rob3Number - 1) % ROB3S_PER_JUZ;
  const juz = JUZ_RANGES[juzIndex];
  if (!juz) return { rob3: rob3Number, rob3InJuz, juz: 1, startPage: 1, endPage: 1 };
  const juzPages = juz.endPage - juz.startPage + 1;
  const pagesPerRob3 = juzPages / ROB3S_PER_JUZ;
  const startPage = juz.startPage + Math.floor(rob3InJuz * pagesPerRob3);
  const endPage =
    rob3InJuz === ROB3S_PER_JUZ - 1
      ? juz.endPage
      : juz.startPage + Math.floor((rob3InJuz + 1) * pagesPerRob3) - 1;
  return { rob3: rob3Number, rob3InJuz, juz: juz.juz, startPage, endPage };
}

export const ALL_ROB3S: Rob3Range[] = Array.from({ length: TOTAL_ROB3S }, (_, i) =>
  getRob3Range(i + 1),
);
