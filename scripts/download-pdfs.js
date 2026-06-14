// ═══════════════════════════════════════════════════════
//  Pathshala — NCERT PDF Downloader
//
//  Downloads NCERT textbooks (ZIP files containing chapter
//  PDFs), extracts them, merges chapters into one PDF per
//  book, saves locally, and updates the catalog.
//
//  Run with: npm run download
// ═══════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { PDFDocument } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");
const PDFS_DIR = path.join(ROOT, "pdfs");
const TEMP_DIR = path.join(ROOT, "pdfs", ".temp");

// ───── Utility: Get NCERT code from viewerUrl ─────
// e.g. "https://ncert.nic.in/textbook.php?kemh1=0-16" → "kemh1"
function extractCode(viewerUrl) {
  if (!viewerUrl) return null;
  const match = viewerUrl.match(/\?(\w+)=/);
  return match ? match[1] : null;
}

// ───── Utility: Build safe filename ─────
function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "_");
}

// ───── Utility: Sleep ─────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ───── Utility: Fetch with timeout and retry ─────
async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 60000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Pathshala/1.0; Educational use)",
          ...(options.headers || {}),
        },
      });

      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      if (attempt < retries) {
        const waitMs = attempt * 3000; // 3s, 6s, 9s
        console.log(`     ⏳ Attempt ${attempt} failed (${err.message}). Retrying in ${waitMs / 1000}s...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

// ───── Download a single ZIP from NCERT ─────
async function downloadZip(code) {
  const url = `https://ncert.nic.in/textbook/pdf/${code}dd.zip`;
  const tempPath = path.join(TEMP_DIR, `${code}.zip`);

  try {
    console.log(`     ↓ Downloading ${url}`);
    const res = await fetchWithRetry(url, {}, 3, 120000); // 2-min timeout, 3 retries

    if (!res.ok) {
      console.log(`     ✗ HTTP ${res.status} — trying chapter-by-chapter fallback`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Sanity check: ZIP files start with 'PK'
    if (buffer.length < 100 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      console.log(`     ✗ Not a valid ZIP file (got ${buffer.length} bytes)`);
      return null;
    }

    fs.writeFileSync(tempPath, buffer);
    console.log(`     ✓ Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
    return tempPath;
  } catch (err) {
    console.log(`     ✗ Download failed after retries: ${err.message}`);
    return null;
  }
}

// ───── Fallback: download chapters one by one ─────
// FIXED: NCERT URL is {code}{chapter}.pdf (e.g. keph101.pdf), NOT {code}1{chapter}.pdf
async function downloadChapters(code, maxChapters = 25) {
  const chapterFiles = [];
  let consecutiveMisses = 0;

  for (let i = 0; i <= maxChapters; i++) {
    const chapterNum = String(i).padStart(2, "0");
    const url = `https://ncert.nic.in/textbook/pdf/${code}${chapterNum}.pdf`;

    try {
      const res = await fetchWithRetry(url, {}, 2, 30000);

      if (!res.ok) {
        consecutiveMisses++;
        // After 3 consecutive 404s past chapter 0, we've hit the end
        if (i > 0 && consecutiveMisses >= 3) break;
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      // Sanity check: PDF starts with %PDF
      if (buffer.length < 1000 || buffer.toString("ascii", 0, 4) !== "%PDF") {
        consecutiveMisses++;
        if (i > 0 && consecutiveMisses >= 3) break;
        continue;
      }

      consecutiveMisses = 0;
      const chapterPath = path.join(TEMP_DIR, `${code}_ch${chapterNum}.pdf`);
      fs.writeFileSync(chapterPath, buffer);
      chapterFiles.push(chapterPath);
      console.log(`     ✓ Chapter ${chapterNum} (${(buffer.length / 1024).toFixed(0)} KB)`);
      await sleep(200); // Be polite to NCERT servers
    } catch (err) {
      consecutiveMisses++;
      if (i > 0 && consecutiveMisses >= 3) break;
    }
  }

  return chapterFiles;
}

// ───── Extract chapter PDFs from a ZIP ─────
function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const pdfFiles = [];

  for (const entry of entries) {
    if (entry.entryName.toLowerCase().endsWith(".pdf")) {
      const outPath = path.join(TEMP_DIR, path.basename(entry.entryName));
      fs.writeFileSync(outPath, entry.getData());
      pdfFiles.push(outPath);
    }
  }

  // Sort by filename so chapters are in order
  pdfFiles.sort();
  return pdfFiles;
}

// ───── Merge multiple PDFs into one ─────
async function mergePdfs(pdfPaths, outputPath) {
  const merged = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    try {
      const bytes = fs.readFileSync(pdfPath);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const indices = pdf.getPageIndices();
      const pages = await merged.copyPages(pdf, indices);
      pages.forEach((page) => merged.addPage(page));
    } catch (err) {
      console.log(`     ⚠️  Could not merge ${path.basename(pdfPath)}: ${err.message}`);
    }
  }

  const finalBytes = await merged.save();
  fs.writeFileSync(outputPath, finalBytes);
  return finalBytes.length;
}

// ───── Process one book ─────
async function processBook(book, index, total) {
  const { board, class: cls, subject, title, viewerUrl } = book;
  const code = extractCode(viewerUrl);

  const header = `[${String(index + 1).padStart(2, "0")}/${total}] ${board} · Class ${cls} · ${subject}`;
  console.log(`\n${header}`);
  console.log(`  📘  ${title}${code ? "  (" + code + ")" : ""}`);

  if (!code) {
    console.log(`     ⚠️  No NCERT code found in viewerUrl, skipping`);
    return { ...book, status: "no-code" };
  }

  // Decide output path
  const subjectSafe = safeName(subject);
  const bookDir = path.join(PDFS_DIR, board, `Class-${cls}`);
  fs.mkdirSync(bookDir, { recursive: true });
  const outputPath = path.join(bookDir, `${subjectSafe}.pdf`);
  const relPath = `/pdfs/${board}/Class-${cls}/${subjectSafe}.pdf`;

  // Skip if already downloaded
  if (fs.existsSync(outputPath)) {
    const size = fs.statSync(outputPath).size;
    console.log(`     ⏭️  Already exists (${(size / 1024 / 1024).toFixed(1)} MB), skipping`);
    return { ...book, file_url: relPath, status: "exists" };
  }

  // Clean temp dir
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Try downloading the complete ZIP first
  let chapterFiles = [];
  const zipPath = await downloadZip(code);

  if (zipPath) {
    try {
      chapterFiles = extractZip(zipPath);
      console.log(`     ✓ Extracted ${chapterFiles.length} chapter PDFs from ZIP`);
    } catch (err) {
      console.log(`     ⚠️  ZIP extraction failed: ${err.message}`);
    }
  }

  // If ZIP didn't work, try chapter-by-chapter
  if (chapterFiles.length === 0) {
    console.log(`     ↻ Trying chapter-by-chapter download...`);
    chapterFiles = await downloadChapters(code);
  }

  if (chapterFiles.length === 0) {
    console.log(`     ❌ Could not download any content for this book`);
    return { ...book, status: "failed" };
  }

  // Merge chapters into one PDF
  console.log(`     ⚙️  Merging ${chapterFiles.length} chapters into one PDF...`);
  try {
    const finalSize = await mergePdfs(chapterFiles, outputPath);
    console.log(`     ✅ Saved to ${relPath} (${(finalSize / 1024 / 1024).toFixed(1)} MB)`);

    // Clean up temp files for this book
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    return { ...book, file_url: relPath, status: "success" };
  } catch (err) {
    console.log(`     ❌ Merge failed: ${err.message}`);
    return { ...book, status: "merge-failed" };
  }
}

// ───── MAIN ─────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  📚  Pathshala — NCERT PDF Downloader                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Load catalog
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("❌ Catalog not found at", CATALOG_PATH);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const books = catalog.textbooks || [];

  console.log(`\n📋 Catalog has ${books.length} textbooks to process`);
  console.log(`📁 PDFs will be saved to: ${PDFS_DIR}\n`);

  // Make sure pdfs directory exists
  fs.mkdirSync(PDFS_DIR, { recursive: true });

  const results = { success: 0, exists: 0, failed: 0, skipped: 0 };
  const updatedBooks = [];

  for (let i = 0; i < books.length; i++) {
    const result = await processBook(books[i], i, books.length);
    updatedBooks.push(result);

    if (result.status === "success") results.success++;
    else if (result.status === "exists") results.exists++;
    else if (result.status === "failed" || result.status === "merge-failed") results.failed++;
    else results.skipped++;

    // Be polite — small delay between books
    await sleep(500);
  }

  // Update catalog with file_url paths
  catalog.textbooks = updatedBooks;
  catalog._meta.lastDownload = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

  // Cleanup temp dir
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  // Final summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊 Download Summary                                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ Newly downloaded:  ${String(results.success).padStart(3)}                                ║`);
  console.log(`║  ⏭️  Already present:   ${String(results.exists).padStart(3)}                                ║`);
  console.log(`║  ❌ Failed:            ${String(results.failed).padStart(3)}                                ║`);
  console.log(`║  ⚠️  Skipped (no code): ${String(results.skipped).padStart(3)}                                ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\n📝 Catalog updated. Restart your server to serve the new PDFs.");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
