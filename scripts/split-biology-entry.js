// ═══════════════════════════════════════════════════════════
//  TutAR Books — Split Class 12 Biology Catalog Entry
//
//  Class 12 Biology (138 MB) is split into 4 parts on disk.
//  This script replaces the single catalog entry with 4 new ones.
//
//  Run with: node scripts/split-biology-entry.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");
const NUM_PARTS = 4;

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📚  Split Class 12 Biology into 4 parts                 ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const textbooks = catalog.textbooks || [];

const original = textbooks.find(
  (b) => b.board === "CBSE" && b.class === "12" && b.subject === "Biology"
);

if (!original) {
  // Check if already split
  const alreadySplit = textbooks.filter(
    (b) => b.board === "CBSE" && b.class === "12" && /^Biology Part \d/.test(b.subject)
  );
  if (alreadySplit.length > 0) {
    console.log(`ℹ️  Catalog already contains ${alreadySplit.length} Biology Part entries.`);
    console.log("    No changes made. Re-run scan-pdfs.js if file_urls need refreshing.");
    process.exit(0);
  }
  console.error("❌ Couldn't find CBSE Class 12 Biology entry. Nothing to do.");
  process.exit(1);
}

console.log("Found existing entry:");
console.log(`  id:       ${original.id}`);
console.log(`  title:    ${original.title}`);
console.log(`  file_url: ${original.file_url || "(none)"}`);
console.log();

function makePart(num) {
  const part = { ...original };
  part.id = `${original.id}-part-${num}`;
  part.subject = `Biology Part ${num}`;
  part.title = `Biology Part ${num} — Class 12`;
  // file_url removed — scan-pdfs.js will repopulate when it sees the files
  delete part.file_url;
  return part;
}

const newParts = [];
for (let i = 1; i <= NUM_PARTS; i++) newParts.push(makePart(i));

// Replace the original entry with the new parts
const idx = textbooks.indexOf(original);
textbooks.splice(idx, 1, ...newParts);

catalog.textbooks = textbooks;
catalog._meta = catalog._meta || {};
catalog._meta.lastSplit = new Date().toISOString();
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

console.log(`✅ Catalog updated. 1 entry → ${NUM_PARTS} entries.\n`);
console.log("New entries:");
for (const p of newParts) {
  console.log(`  • ${p.id}  →  ${p.title}`);
}
console.log();
console.log("📝 Next steps:");
console.log("  1. Confirm these files exist:");
for (let i = 1; i <= NUM_PARTS; i++) {
  console.log(`     pdfs/CBSE/Class-12/Biology_Part_${i}.pdf`);
}
console.log("  2. Delete the old Biology.pdf from that folder if still there.");
console.log("  3. Run:  node scripts/scan-pdfs.js");
console.log("  4. Run:  node scripts/prepare-upload.js");
console.log("  5. On GitHub Release v1.0-textbooks:");
console.log("     • Delete: CBSE-Class-12-Biology.pdf");
console.log("     • Upload: CBSE-Class-12-Biology_Part_1.pdf through Part_4.pdf");
console.log("  6. Run:  node scripts/use-github-urls.js --verify");
console.log("  7. Run:  node scripts/audit-pdf-sizes.js  to confirm all under 80 MB");
