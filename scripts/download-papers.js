// ═══════════════════════════════════════════════════════════
//  TutAR Books — CBSE Sample Papers Auto-Downloader
//
//  Downloads CBSE Class 10 and 12 sample papers directly from
//  cbseacademic.nic.in. URL pattern:
//    Class XII: web_material/SQP/ClassXII_2024_25/{Subject}-SQP.pdf
//    Class X:   web_material/SQP/ClassX_2024_25/{Subject}-SQP.pdf
//
//  Run with: node scripts/download-papers.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PDFS_DIR = path.join(ROOT, "pdfs");

const BASE_XII = "https://cbseacademic.nic.in/web_material/SQP/ClassXII_2024_25/";
const BASE_X = "https://cbseacademic.nic.in/web_material/SQP/ClassX_2024_25/";

// Map each catalog subject to the CBSE filename
// Multiple candidates per subject (CBSE filename quirks)
const CLASS_12_PAPERS = {
  "Mathematics":       ["Maths-SQP.pdf"],
  "Physics":           ["Physics-SQP.pdf"],
  "Chemistry":         ["Chemistry-SQP.pdf"],
  "Biology":           ["Biology-SQP.pdf", "Bio-SQP.pdf"],
  "English":           ["English-Core-SQP.pdf", "English-SQP.pdf", "EnglishCore-SQP.pdf"],
  "Computer Science":  ["ComputerSc-SQP.pdf", "ComputerScience-SQP.pdf", "ComputerScienceN-SQP.pdf"],
  "Accountancy":       ["Accountancy-SQP.pdf"],
  "Business Studies":  ["BST-SQP.pdf", "BusinessStudies-SQP.pdf"],
  "Economics":         ["Economics-SQP.pdf"],
  "History":           ["History-SQP.pdf"],
  "Geography":         ["Geography-SQP.pdf"],
  "Political Science": ["PolSci-SQP.pdf", "PolSc-SQP.pdf", "PoliticalScience-SQP.pdf", "Pol-Sc-SQP.pdf"],
  "Psychology":        ["Psychology-SQP.pdf"],
};

const CLASS_10_PAPERS = {
  "Mathematics":    ["MathsStandard-SQP.pdf", "Maths-SQP.pdf", "MathsBasic-SQP.pdf"],
  "Science":        ["Science-SQP.pdf"],
  "English":        ["EnglishL-SQP.pdf", "EnglishLandL-SQP.pdf", "EnglishLLit-SQP.pdf", "English-SQP.pdf"],
  "Social Science": ["Social-Science-SQP.pdf", "SS-SQP.pdf", "SocialScience-SQP.pdf", "SST-SQP.pdf"],
  "Hindi":          ["HindiCourseA-SQP.pdf", "HindiCourseB-SQP.pdf", "HindiA-SQP.pdf", "HindiB-SQP.pdf", "Hindi-SQP.pdf"],
  "Sanskrit":       ["Sanskrit-SQP.pdf"],
};

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "_");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadPdf(url, destPath) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TutAR-Books/1.0)" }
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { ok: false, status: res.status };

    const buffer = Buffer.from(await res.arrayBuffer());
    // PDF must start with %PDF
    if (buffer.length < 1000 || buffer.toString("ascii", 0, 4) !== "%PDF") {
      return { ok: false, reason: "not a PDF (got HTML?)" };
    }
    fs.writeFileSync(destPath, buffer);
    return { ok: true, size: buffer.length };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function tryDownload(baseUrl, candidates, destPath, label) {
  for (const filename of candidates) {
    const url = baseUrl + filename;
    process.stdout.write(`   Trying ${filename} ... `);
    const result = await downloadPdf(url, destPath);
    if (result.ok) {
      const sizeKb = (result.size / 1024).toFixed(0);
      console.log(`✓ (${sizeKb} KB)`);
      return true;
    } else {
      console.log(`✗ ${result.status || result.reason || ""}`);
      await sleep(200);
    }
  }
  return false;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  📝  TutAR Books — CBSE 2024-25 Sample Papers Downloader ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Ensure paper directories exist
  const class10Dir = path.join(PDFS_DIR, "CBSE", "Class-10", "papers");
  const class12Dir = path.join(PDFS_DIR, "CBSE", "Class-12", "papers");
  fs.mkdirSync(class10Dir, { recursive: true });
  fs.mkdirSync(class12Dir, { recursive: true });

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  // Class 10 papers
  console.log("📘 CLASS 10 — Sample Papers (2024-25)\n");
  for (const [subject, candidates] of Object.entries(CLASS_10_PAPERS)) {
    const destFilename = `${safeName(subject)}-2024.pdf`;
    const destPath = path.join(class10Dir, destFilename);

    console.log(`  ${subject}`);

    if (fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      console.log(`   ⏭️  Already have ${destFilename} (${(size/1024).toFixed(0)} KB)\n`);
      skipped++;
      continue;
    }

    const success = await tryDownload(BASE_X, candidates, destPath, subject);
    if (success) downloaded++;
    else { failed++; console.log(`   ❌ Could not find ${subject}\n`); continue; }
    console.log("");
    await sleep(300);
  }

  // Class 12 papers
  console.log("\n📕 CLASS 12 — Sample Papers (2024-25)\n");
  for (const [subject, candidates] of Object.entries(CLASS_12_PAPERS)) {
    const destFilename = `${safeName(subject)}-2024.pdf`;
    const destPath = path.join(class12Dir, destFilename);

    console.log(`  ${subject}`);

    if (fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      console.log(`   ⏭️  Already have ${destFilename} (${(size/1024).toFixed(0)} KB)\n`);
      skipped++;
      continue;
    }

    const success = await tryDownload(BASE_XII, candidates, destPath, subject);
    if (success) downloaded++;
    else { failed++; console.log(`   ❌ Could not find ${subject}\n`); continue; }
    console.log("");
    await sleep(300);
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊 Download Summary                                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ Newly downloaded:   ${String(downloaded).padStart(3)}                              ║`);
  console.log(`║  ⏭️  Already present:   ${String(skipped).padStart(3)}                              ║`);
  console.log(`║  ❌ Could not find:     ${String(failed).padStart(3)}                              ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  console.log("\n📝 Next: Run 'node scripts/scan-papers.js' to register them in books.json");
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
