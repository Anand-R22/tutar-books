// ═══════════════════════════════════════════════════════════
//  TutAR Books — Question Papers PDF Scanner (v2)
//
//  Detects PDFs in pdfs/{Board}/Class-{N}/papers/
//  Supports both standard {Subject}-{Year}.pdf format
//  and split-semester {Subject}-2022-Sem1.pdf format.
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");
const PDFS_DIR = path.join(ROOT, "pdfs");

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "_");
}

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📝  TutAR Books — Question Papers Scanner               ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const papers = catalog.questionPapers || [];

let detected = 0;
let stillMissing = 0;
const found = [];
const missing = [];

console.log("🔍 Scanning paper folders...\n");

for (const paper of papers) {
  const subjectSafe = safeName(paper.subject);

  // year value might be "2024" or "2022-Sem1"
  // For filename we keep the same format the renamer used: {Subject}-{Year}.pdf
  // where year could be "2024" or "2022-Sem1"
  const filename = `${subjectSafe}-${paper.year}.pdf`;
  const expectedPath = path.join(PDFS_DIR, paper.board, `Class-${paper.class}`, "papers", filename);
  const relPath = `/pdfs/${paper.board}/Class-${paper.class}/papers/${filename}`;

  if (fs.existsSync(expectedPath)) {
    const size = fs.statSync(expectedPath).size;
    const sizeMb = (size / 1024 / 1024).toFixed(1);

    if (!paper.file_url) {
      paper.file_url = relPath;
      detected++;
      found.push({ ...paper, size: sizeMb, isNew: true });
      console.log(`✨ NEW: ${paper.board} Class ${paper.class} ${paper.subject} ${paper.year} (${sizeMb} MB)`);
    } else {
      found.push({ ...paper, size: sizeMb, isNew: false });
    }
  } else {
    if (paper.file_url && paper.file_url.startsWith("/pdfs/")) {
      delete paper.file_url;
      console.log(`⚠️  Removed: ${paper.board} Class ${paper.class} ${paper.subject} ${paper.year} (file deleted)`);
    }
    stillMissing++;
    missing.push(paper);
  }
}

catalog.questionPapers = papers;
catalog._meta.lastPapersScan = new Date().toISOString();
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  📊 Scan Summary                                         ║");
console.log("╠══════════════════════════════════════════════════════════╣");
console.log(`║  ✨ Newly detected:     ${String(detected).padStart(3)}                              ║`);
console.log(`║  ✅ Total available:    ${String(found.length).padStart(3)}                              ║`);
console.log(`║  📥 Still missing:      ${String(stillMissing).padStart(3)}                              ║`);
console.log(`║  📚 Catalog total:      ${String(papers.length).padStart(3)}                              ║`);
console.log("╚══════════════════════════════════════════════════════════╝\n");

const groups = {};
for (const p of found) {
  const key = `${p.board} Class ${p.class}`;
  groups[key] = (groups[key] || 0) + 1;
}
console.log("📚 Available papers by class:");
for (const [key, count] of Object.entries(groups)) {
  console.log(`   • ${key}: ${count} papers`);
}

if (stillMissing > 0) {
  console.log(`\n💡 ${stillMissing} papers still need PDFs.`);
}

console.log("\n📝 books.json updated. Restart your server to see new papers.");
