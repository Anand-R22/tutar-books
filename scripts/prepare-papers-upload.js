// ═══════════════════════════════════════════════════════════
//  TutAR Books — Prepare Question Papers for GitHub Upload
//
//  Copies question paper PDFs from pdfs/{Board}/Class-{N}/papers/
//  to upload-ready-papers/ with flat unique names like:
//    CBSE-Class-10-Mathematics-2024.pdf
//
//  Run with: node scripts/prepare-papers-upload.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PDFS_DIR = path.join(ROOT, "pdfs");
const UPLOAD_DIR = path.join(ROOT, "upload-ready-papers");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📦  TutAR Books — Prepare Question Papers Upload        ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

if (!fs.existsSync(PDFS_DIR)) {
  console.error("❌ No pdfs/ folder found");
  process.exit(1);
}

// Reset upload folder
if (fs.existsSync(UPLOAD_DIR)) fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

console.log("🔍 Scanning paper folders...\n");

let count = 0;
let totalSize = 0;

const boards = fs.readdirSync(PDFS_DIR).filter((d) =>
  fs.statSync(path.join(PDFS_DIR, d)).isDirectory() && !d.startsWith(".")
);

for (const board of boards) {
  const boardDir = path.join(PDFS_DIR, board);
  const classes = fs.readdirSync(boardDir).filter((d) =>
    fs.statSync(path.join(boardDir, d)).isDirectory()
  );

  for (const cls of classes) {
    const papersDir = path.join(boardDir, cls, "papers");
    if (!fs.existsSync(papersDir)) continue;

    const pdfs = fs.readdirSync(papersDir).filter((f) =>
      f.toLowerCase().endsWith(".pdf")
    );

    for (const pdf of pdfs) {
      const srcPath = path.join(papersDir, pdf);
      // Build flat name: CBSE-Class-10-{filename}
      // pdf is already like "Mathematics-2024.pdf", so join cleanly
      const newName = `${board}-${cls}-${pdf}`;
      const destPath = path.join(UPLOAD_DIR, newName);

      fs.copyFileSync(srcPath, destPath);
      const size = fs.statSync(srcPath).size;
      totalSize += size;
      count++;

      const sizeMb = (size / 1024 / 1024).toFixed(1);
      console.log(`  ✓ ${newName} (${sizeMb} MB)`);
    }
  }
}

console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║  📊 Prepared ${String(count).padStart(3)} papers (${(totalSize / 1024 / 1024).toFixed(1)} MB total)`.padEnd(59) + "║");
console.log(`╚══════════════════════════════════════════════════════════╝`);

if (count === 0) {
  console.log(`\n⚠️  No question papers found.`);
  console.log(`   Expected location: ${PDFS_DIR}/{BOARD}/Class-{N}/papers/{Subject}-{Year}.pdf`);
  console.log(`   See QUESTION_PAPERS_GUIDE.md for what to download.`);
} else {
  console.log(`\n📁 Upload-ready papers in:`);
  console.log(`   ${UPLOAD_DIR}\n`);
  console.log(`📤 Next steps:`);
  console.log(`   1. Create a new GitHub Release with tag: v2.0-questionpapers`);
  console.log(`   2. Drag-drop all files from upload-ready-papers/ to that release`);
  console.log(`   3. Publish the release`);
  console.log(`   4. Run: node scripts/use-github-urls.js --papers --verify\n`);
}
