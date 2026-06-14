// ═══════════════════════════════════════════════════════════
//  Pathshala — PDF Auto-Detection
//
//  Scans the pdfs/ folder for manually-added PDFs and updates
//  books.json so the app recognizes them.
//
//  Run with: npm run scan-pdfs
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
console.log("║  📁  Pathshala — PDF Auto-Detection                      ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// Load catalog
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const books = catalog.textbooks || [];

let detectedNew = 0;
let detectedExisting = 0;
let missing = 0;

console.log("🔍 Scanning each book in catalog...\n");

const newlyDetected = [];
const stillMissing = [];

for (const book of books) {
  const subjectSafe = safeName(book.subject);
  const expectedPath = path.join(PDFS_DIR, book.board, `Class-${book.class}`, `${subjectSafe}.pdf`);
  const relPath = `/pdfs/${book.board}/Class-${book.class}/${subjectSafe}.pdf`;

  if (fs.existsSync(expectedPath)) {
    const size = fs.statSync(expectedPath).size;
    const sizeMb = (size / 1024 / 1024).toFixed(1);

    if (book.file_url) {
      // Already registered
      detectedExisting++;
    } else {
      // Newly detected!
      book.file_url = relPath;
      detectedNew++;
      newlyDetected.push({
        ...book,
        size: sizeMb,
      });
      console.log(`✨ NEW: ${book.board} · Class ${book.class} · ${book.subject}`);
      console.log(`        ${book.title} (${sizeMb} MB)`);
    }
  } else {
    // File not present
    if (book.file_url) {
      // Was registered but file is gone now — un-register it
      delete book.file_url;
      console.log(`⚠️  Missing: ${book.board} · Class ${book.class} · ${book.subject} (file deleted, un-registering)`);
    }
    missing++;
    stillMissing.push(book);
  }
}

// Save updated catalog
catalog.textbooks = books;
catalog._meta.lastScan = new Date().toISOString();
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

// Summary
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  📊 Scan Summary                                         ║");
console.log("╠══════════════════════════════════════════════════════════╣");
console.log(`║  ✨ Newly detected:     ${String(detectedNew).padStart(3)}                              ║`);
console.log(`║  ✅ Already registered: ${String(detectedExisting).padStart(3)}                              ║`);
console.log(`║  ❌ Still missing:      ${String(missing).padStart(3)}                              ║`);
console.log("╠══════════════════════════════════════════════════════════╣");
console.log(`║  📚 TOTAL WORKING:      ${String(detectedNew + detectedExisting).padStart(3)} / ${String(books.length).padStart(3)} books${" ".repeat(15)}║`);
console.log("╚══════════════════════════════════════════════════════════╝");

if (newlyDetected.length > 0) {
  console.log("\n🎉 Newly added books to your library:");
  for (const b of newlyDetected) {
    console.log(`   • Class ${b.class} ${b.subject}: ${b.title} (${b.size} MB)`);
  }
}

if (stillMissing.length > 0) {
  console.log(`\n📝 Still missing PDFs (${stillMissing.length}):`);
  for (const b of stillMissing) {
    const subjectSafe = safeName(b.subject);
    const expectedPath = `/pdfs/${b.board}/Class-${b.class}/${subjectSafe}.pdf`;
    console.log(`   • ${b.board} Class ${b.class} ${b.subject}: ${b.title}`);
    console.log(`        Expected at: ${expectedPath}`);
  }
}

console.log("\n📝 books.json updated. Restart your server if running.");
