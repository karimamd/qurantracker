import { parse } from "regexparam";

interface Case {
  pattern: string;
  shouldMatch: string[];
  shouldNotMatch?: string[];
  description: string;
}

const cases: Case[] = [
  {
    pattern: "/",
    shouldMatch: ["/"],
    shouldNotMatch: ["/dashboard", "/juz/1"],
    description: "Root path matches only '/'",
  },
  {
    pattern: "*",
    shouldMatch: [
      "/",
      "/dashboard",
      "/juz",
      "/juz/1",
      "/juz/30",
      "/surah",
      "/surah/2",
      "/surah/114",
      "/pages",
      "/recite",
      "/homework",
      "/homework/7",
      "/homework/9999",
      "/settings",
    ],
    description: "Catch-all wildcard '*' matches every URL (used for ProtectedApp). NOTE: '/:rest*' does NOT work in wouter 3 + regexparam 3 — the '*' is treated as part of the param name, so it only matches single-segment paths like /dashboard but fails for /juz/1.",
  },
  {
    pattern: "/dashboard",
    shouldMatch: ["/dashboard"],
    shouldNotMatch: ["/juz/1", "/dashboard/x"],
    description: "Inner Switch route /dashboard matches exactly /dashboard",
  },
  {
    pattern: "/juz/:id",
    shouldMatch: ["/juz/1", "/juz/30"],
    shouldNotMatch: ["/juz", "/juz/1/extra"],
    description: "Inner Switch route /juz/:id matches single id segment",
  },
  {
    pattern: "/surah/:id",
    shouldMatch: ["/surah/1", "/surah/2", "/surah/114"],
    shouldNotMatch: ["/surah", "/surah/1/extra"],
    description: "Inner Switch route /surah/:id matches single id segment",
  },
  {
    pattern: "/homework/:id",
    shouldMatch: ["/homework/1", "/homework/7", "/homework/9999"],
    shouldNotMatch: ["/homework", "/homework/1/extra"],
    description: "Inner Switch route /homework/:id matches single id segment",
  },
];

const failures: string[] = [];

for (const c of cases) {
  const { pattern } = parse(c.pattern);
  for (const path of c.shouldMatch) {
    if (!pattern.test(path)) {
      failures.push(`FAIL: pattern '${c.pattern}' should MATCH '${path}' — ${c.description}`);
    }
  }
  for (const path of c.shouldNotMatch ?? []) {
    if (pattern.test(path)) {
      failures.push(`FAIL: pattern '${c.pattern}' should NOT match '${path}' — ${c.description}`);
    }
  }
}

const brokenPattern = parse("/:rest*");
const brokenSamples = ["/juz/1", "/surah/2", "/homework/7"];
const brokenStillBroken = brokenSamples.every(s => !brokenPattern.pattern.test(s));
if (!brokenStillBroken) {
  failures.push(
    `FAIL: regexparam '/ :rest*' behavior changed; the regression guard is no longer relevant. Re-evaluate route patterns and update this test.`,
  );
}

if (failures.length > 0) {
  console.error("Route-pattern regression test FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(`route-pattern regression test passed (${cases.length} pattern groups verified).`);
