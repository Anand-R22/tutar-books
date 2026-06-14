// ═══════════════════════════════════════════════════════════
//  Pathshala — Internet Archive PDF Downloader
//
//  Downloads NCERT books from Internet Archive when they're
//  no longer available on ncert.nic.in (e.g. due to curriculum
//  transitions). Internet Archive preserves older editions.
//
//  Run with: npm run download-archive
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");
const PDFS_DIR = path.join(ROOT, "pdfs");
const TEMP_DIR = path.join(ROOT, "pdfs", ".temp-archive");

// ───── Utility: Get NCERT code from viewerUrl ─────
function extractCode(viewerUrl) {
  if (!viewerUrl) return null;
  const match = viewerUrl.match(/\?(\w+)=/);
  return match ? match[1] : null;
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "_");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ───── Fetch with timeout and retries ─────
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
        const waitMs = attempt * 3000;
        console.log(`     ⏳ Attempt ${attempt} failed (${err.message}). Retrying in ${waitMs / 1000}s...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

// ───── Get list of files in an Internet Archive item ─────
async function getArchiveFiles(code) {
  const metadataUrl = `https://archive.org/metadata/ncert-${code}`;
  try {
    const res = await fetchWithRetry(metadataUrl, {}, 2, 30000);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.files || data.files.length === 0) return null;

    // Find PDFs that look like chapters: {code}{NN}.pdf
    // Examples: keph101.pdf, keph102.pdf, etc.
    const chapterRegex = new RegExp(`^${code}\\d+\\.pdf$`, "i");
    const chapterFiles = data.files
      .filter((f) => chapterRegex.test(f.name))
      .map((f) => f.name)
      .sort();

    if (chapterFiles.length > 0) {
      return chapterFiles;
    }

    // Fallback: any PDF in the archive
    const anyPdf = data.files
      .filter((f) => f.name.toLowerCase().endsWith(".pdf") && !f.name.toLowerCase().includes("ps."))
      .map((f) => f.name)
      .sort();

    return anyPdf.length > 0 ? anyPdf : null;
  } catch (err) {
    console.log(`     ⚠️  Metadata fetch failed: ${err.message}`);
    return null;
  }
}

// ───── Download a single chapter PDF from Archive ─────
async function downloadChapterFromArchive(code, filename) {
  const url = `https://archive.org/download/ncert-${code}/${filename}`;

  try {
    const res = await fetchWithRetry(url, {}, 2, 60000);
    if (!res.ok) {
      console.log(`     ✗ HTTP ${res.status} for ${filename}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    // Sanity check: PDF starts with %PDF
    if (buffer.length < 1000 || buffer.toString("ascii", 0, 4) !== "%PDF") {
      console.log(`     ✗ Not a valid PDF: ${filename}`);
      return null;
    }

    const chapterPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(chapterPath, buffer);
    return { path: chapterPath, size: buffer.length };
  } catch (err) {
    console.log(`     ✗ Download failed for ${filename}: ${err.message}`);
    return null;
  }
}

// ───── Merge PDFs into one ─────
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
    console.log(`     ⚠️  No NCERT code found, skipping`);
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

  // Look up the book on Internet Archive
  console.log(`     🔍 Searching archive.org/details/ncert-${code}...`);
  const chapterFiles = await getArchiveFiles(code);

  if (!chapterFiles || chapterFiles.length === 0) {
    console.log(`     ❌ Not found on Internet Archive`);
    return { ...book, status: "not-on-archive" };
  }

  console.log(`     ✓ Found ${chapterFiles.length} chapter PDFs on Archive`);

  // Clean temp dir
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Download each chapter
  const downloadedFiles = [];
  for (const filename of chapterFiles) {
    const result = await downloadChapterFromArchive(code, filename);
    if (result) {
      downloadedFiles.push(result.path);
      console.log(`     ✓ ${filename} (${(result.size / 1024).toFixed(0)} KB)`);
    }
    await sleep(300); // Be polite to Archive.org
  }

  if (downloadedFiles.length === 0) {
    console.log(`     ❌ Could not download any chapters`);
    return { ...book, status: "failed" };
  }

  // Merge into one PDF
  console.log(`     ⚙️  Merging ${downloadedFiles.length} chapters...`);
  try {
    const finalSize = await mergePdfs(downloadedFiles, outputPath);
    console.log(`     ✅ Saved to ${relPath} (${(finalSize / 1024 / 1024).toFixed(1)} MB)`);

    // Clean up
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
  console.log("║  📚  Pathshala — Internet Archive PDF Downloader         ║");
  console.log("║                                                          ║");
  console.log("║  Downloads books that NCERT removed during the           ║");
  console.log("║  NEP 2020 curriculum transition.                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Load catalog
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("❌ Catalog not found at", CATALOG_PATH);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const allBooks = catalog.textbooks || [];

  // Filter: only books without a file_url (i.e. failed downloads)
  const missing = allBooks.filter((b) => !b.file_url);

  console.log(`\n📋 Catalog has ${allBooks.length} total textbooks`);
  console.log(`📥 ${missing.length} books still need PDFs`);
  console.log(`📁 PDFs will be saved to: ${PDFS_DIR}\n`);

  if (missing.length === 0) {
    console.log("🎉 All books already downloaded! Nothing to do.");
    return;
  }

  fs.mkdirSync(PDFS_DIR, { recursive: true });

  const results = {
    success: 0,
    exists: 0,
    notOnArchive: 0,
    failed: 0,
    skipped: 0,
  };
  const updatedBooks = [];

  for (let i = 0; i < missing.length; i++) {
    const result = await processBook(missing[i], i, missing.length);
    updatedBooks.push(result);

    if (result.status === "success") results.success++;
    else if (result.status === "exists") results.exists++;
    else if (result.status === "not-on-archive") results.notOnArchive++;
    else if (result.status === "failed" || result.status === "merge-failed") results.failed++;
    else results.skipped++;

    await sleep(500);
  }

  // Merge updated books back into catalog
  const updatedById = new Map(updatedBooks.map((b) => [b.id, b]));
  catalog.textbooks = allBooks.map((b) => updatedById.get(b.id) || b);
  catalog._meta.lastArchiveDownload = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

  // Cleanup
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊 Archive Download Summary                             ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ Newly downloaded:     ${String(results.success).padStart(3)}                            ║`);
  console.log(`║  ⏭️  Already present:      ${String(results.exists).padStart(3)}                            ║`);
  console.log(`║  ❌ Not on Archive:       ${String(results.notOnArchive).padStart(3)}                            ║`);
  console.log(`║  ❌ Failed:               ${String(results.failed).padStart(3)}                            ║`);
  console.log(`║  ⚠️  Skipped (no code):    ${String(results.skipped).padStart(3)}                            ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\n📝 Catalog updated. Restart your server to serve the new PDFs.");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
