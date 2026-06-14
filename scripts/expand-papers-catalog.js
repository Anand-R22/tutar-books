// ═══════════════════════════════════════════════════════════
//  TutAR Books — Expand Question Papers Catalog (v3)
//
//  Builds questionPapers list for CBSE + ICSE.
//  ICSE includes split 2022 Semester 1 + Semester 2 papers.
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📚  TutAR Books — Expand Question Papers Catalog        ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const existingPapers = catalog.questionPapers || [];
console.log(`📋 Current catalog has ${existingPapers.length} paper entries\n`);

// CBSE
const cbseClass10 = ["Mathematics", "Science", "English", "Social Science", "Hindi", "Sanskrit"];
const cbseClass12 = ["Mathematics", "Physics", "Chemistry", "Biology", "English",
  "Computer Science", "Accountancy", "Business Studies", "Economics",
  "History", "Geography", "Political Science", "Psychology"];
const cbseYears = ["2024", "2023", "2022", "2021", "2020"];

// ICSE Class 10
const icse10Subjects = [
  "Mathematics", "English Paper 1", "English Paper 2",
  "Physics", "Chemistry", "Biology",
  "Hindi", "Sanskrit",
  "History and Civics", "Geography", "Computer Applications",
];

// ICSE Class 12 (ISC)
const icse12Subjects = [
  "Mathematics", "English Paper 1", "English Paper 2", "Hindi", "Sanskrit",
  "Physics Paper 1", "Physics Paper 2",
  "Chemistry Paper 1", "Chemistry Paper 2",
  "Biology Paper 1", "Biology Paper 2",
  "Computer Science Paper 1", "Computer Science Paper 2",
  "Accountancy", "Business Studies", "Commerce", "Economics",
  "History", "Political Science", "Geography",
  "Sociology", "Psychology",
];

// ICSE years — 2022 split into Sem1 and Sem2 (COVID year)
const icseYears = ["2025", "2024", "2023", "2022-Sem1", "2022-Sem2", "2020", "2019"];

const targetPapers = [];

function addPapers(board, cls, subjects, years, publisher) {
  for (const subject of subjects) {
    for (const year of years) {
      const subjectId = subject.toLowerCase().replace(/[\s_]/g, "-");
      const yearId = year.toLowerCase();
      const isICSE = board === "ICSE";

      // Display title: "Mathematics — Specimen Paper 2022 (Semester 1)"
      const yearDisplay = year.includes("Sem")
        ? year.replace("-Sem1", " (Semester 1)").replace("-Sem2", " (Semester 2)")
        : year;

      targetPapers.push({
        id: `${board.toLowerCase()}-${cls}-${subjectId}-${yearId}`,
        board, class: cls, subject, year,
        title: `${subject} — ${isICSE ? "Specimen Paper" : "Sample Paper"} ${yearDisplay}`,
        publisher,
        type: "official",
      });
    }
  }
}

addPapers("CBSE", "10", cbseClass10, cbseYears, "CBSE");
addPapers("CBSE", "12", cbseClass12, cbseYears, "CBSE");
addPapers("ICSE", "10", icse10Subjects, icseYears, "CISCE");
addPapers("ICSE", "12", icse12Subjects, icseYears, "CISCE");

console.log(`🎯 Target: ${targetPapers.length} entries total\n`);

// Merge: preserve existing file_url
const existingById = new Map(existingPapers.map(p => [p.id, p]));
const merged = [];
let preserved = 0, added = 0;

for (const target of targetPapers) {
  const existing = existingById.get(target.id);
  if (existing) {
    merged.push(existing);
    if (existing.file_url) preserved++;
  } else {
    merged.push(target);
    added++;
  }
}

console.log(`✅ Preserved ${preserved} entries with file_url`);
console.log(`✨ Added ${added} new entries`);
console.log(`📊 Total entries: ${merged.length}\n`);

const groups = {};
for (const p of merged) {
  const key = `${p.board} Class ${p.class}`;
  groups[key] = (groups[key] || 0) + 1;
}
for (const [k, v] of Object.entries(groups)) console.log(`   ${k}: ${v} entries`);

catalog.questionPapers = merged;
catalog._meta.lastCatalogExpand = new Date().toISOString();
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

console.log("\n📝 books.json updated.");
console.log("📝 Next: 'node scripts/scan-papers.js' to detect downloaded PDFs.");
