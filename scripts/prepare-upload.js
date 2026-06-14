// ═══════════════════════════════════════════════════════════
//  TutAR Books — Prepare PDFs for GitHub Release Upload
//
//  Copies all PDFs from pdfs/ to upload-ready/ folder with
//  unique flat names (CBSE-Class-11-Mathematics.pdf).
//  Leaves original pdfs/ folder untouched.
//
//  Run with: npm run prepare-upload
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PDFS_DIR = path.join(ROOT, "pdfs");
const UPLOAD_DIR = path.join(ROOT, "upload-ready");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📦  TutAR Books — Prepare PDFs for GitHub Upload        ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

if (!fs.existsSync(PDFS_DIR)) {
  console.error("❌ No pdfs/ folder found at", PDFS_DIR);
  process.exit(1);
}

// Clean and recreate upload folder
if (fs.existsSync(UPLOAD_DIR)) {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

console.log("🔍 Scanning pdfs/ folder...\n");

let count = 0;
let totalSize = 0;

// Walk through pdfs/{BOARD}/Class-{N}/*.pdf
const boards = fs.readdirSync(PDFS_DIR).filter((d) =>
  fs.statSync(path.join(PDFS_DIR, d)).isDirectory() && !d.startsWith(".")
);

for (const board of boards) {
  const boardDir = path.join(PDFS_DIR, board);
  const classes = fs.readdirSync(boardDir).filter((d) =>
    fs.statSync(path.join(boardDir, d)).isDirectory()
  );

  for (const cls of classes) {
    const classDir = path.join(boardDir, cls);
    const pdfs = fs.readdirSync(classDir).filter((f) =>
      f.toLowerCase().endsWith(".pdf")
    );

    for (const pdf of pdfs) {
      const srcPath = path.join(classDir, pdf);
      // Build flat unique name: CBSE-Class-11-Mathematics.pdf
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
console.log(`║  📊 Prepared ${String(count).padStart(3)} PDFs (${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB total)`.padEnd(59) + "║");
console.log(`╚══════════════════════════════════════════════════════════╝`);
console.log(`\n📁 Upload-ready files are in:`);
console.log(`   ${UPLOAD_DIR}\n`);
console.log(`📤 Next: Drag-drop all files from this folder to your GitHub Release.\n`);
