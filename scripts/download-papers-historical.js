// ═══════════════════════════════════════════════════════════
//  TutAR Books — CBSE Sample Papers Historical Downloader
//
//  Downloads CBSE sample papers for years 2019-2023 from
//  cbseacademic.nic.in archive folders.
//
//  Each year has folder: ClassXII_{year}_{nextyear}/
//  Example: 2023 → ClassXII_2023_24/{Subject}-SQP.pdf
//
//  Run with: node scripts/download-papers-historical.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PDFS_DIR = path.join(ROOT, "pdfs");

// Year → folder mapping
// Note: 2019-20 used underscore in filename; 2020+ used dash
const YEAR_FOLDERS = {
  "2023": { folder: "_2023_24", sep: "-" },
  "2022": { folder: "_2022_23", sep: "-" },
  "2021": { folder: "_2021_22", sep: "-" },
  "2020": { folder: "_2020_21", sep: "-" },
  "2019": { folder: "_2019_20", sep: "_" },
};

// Filenames vary year-to-year — try multiple candidates per subject.
function makeCandidates(baseNames, sep) {
  return baseNames.map(n => `${n}${sep}SQP.pdf`);
}

// Subject filename bases (base names; SQP suffix added with separator)
const CLASS_12_BASES = {
  "Mathematics":       ["Maths"],
  "Physics":           ["Physics"],
  "Chemistry":         ["Chemistry"],
  "Biology":           ["Biology", "Bio"],
  "English":           ["EnglishCore", "English-Core", "English"],
  "Computer Science":  ["ComputerScience", "ComputerSc", "ComputerScienceN"],
  "Accountancy":       ["Accountancy"],
  "Business Studies":  ["BusinessStudies", "BST"],
  "Economics":         ["Economics"],
  "History":           ["History"],
  "Geography":         ["Geography"],
  "Political Science": ["PolSci", "PolSc", "PoliticalScience"],
  "Psychology":        ["Psychology"],
};

const CLASS_10_BASES = {
  "Mathematics":    ["MathsStandard", "Maths", "MathsBasic", "Mathematics"],
  "Science":        ["Science"],
  "English":        ["EnglishL", "EnglishLandL", "English-LL", "English", "EnglishCom"],
  "Social Science": ["Social-Science", "SocialScience", "SS", "SST"],
  "Hindi":          ["HindiCourseA", "HindiCourseB", "HindiA", "HindiB", "Hindi"],
  "Sanskrit":       ["Sanskrit"],
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
    if (buffer.length < 1000 || buffer.toString("ascii", 0, 4) !== "%PDF") {
      return { ok: false, reason: "not a PDF" };
    }
    fs.writeFileSync(destPath, buffer);
    return { ok: true, size: buffer.length };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function tryCandidates(baseUrl, candidates, destPath) {
  for (const filename of candidates) {
    const url = baseUrl + filename;
    process.stdout.write(`     Trying ${filename} ... `);
    const result = await downloadPdf(url, destPath);
    if (result.ok) {
      const sizeKb = (result.size / 1024).toFixed(0);
      console.log(`✓ (${sizeKb} KB)`);
      return true;
    } else {
      console.log(`✗`);
      await sleep(150);
    }
  }
  return false;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  📝  TutAR Books — Historical Sample Papers Downloader   ║");
  console.log("║       Years: 2019, 2020, 2021, 2022, 2023               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const class10Dir = path.join(PDFS_DIR, "CBSE", "Class-10", "papers");
  const class12Dir = path.join(PDFS_DIR, "CBSE", "Class-12", "papers");
  fs.mkdirSync(class10Dir, { recursive: true });
  fs.mkdirSync(class12Dir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [year, config] of Object.entries(YEAR_FOLDERS)) {
    console.log(`\n═══════════════ YEAR ${year}-${parseInt(year)+1} ═══════════════\n`);

    // Class 10
    console.log(`📘 CLASS 10 — ${year}`);
    const base10 = `https://cbseacademic.nic.in/web_material/SQP/ClassX${config.folder}/`;
    for (const [subject, bases] of Object.entries(CLASS_10_BASES)) {
      const destFile = `${safeName(subject)}-${year}.pdf`;
      const destPath = path.join(class10Dir, destFile);

      if (fs.existsSync(destPath)) {
        console.log(`   ⏭️  ${subject}: already have ${destFile}`);
        skipped++;
        continue;
      }

      console.log(`   ${subject}:`);
      const candidates = makeCandidates(bases, config.sep);
      const ok = await tryCandidates(base10, candidates, destPath);
      if (ok) downloaded++;
      else { failed++; console.log(`     ❌ Not found for ${year}`); }
      await sleep(200);
    }

    // Class 12
    console.log(`\n📕 CLASS 12 — ${year}`);
    const base12 = `https://cbseacademic.nic.in/web_material/SQP/ClassXII${config.folder}/`;
    for (const [subject, bases] of Object.entries(CLASS_12_BASES)) {
      const destFile = `${safeName(subject)}-${year}.pdf`;
      const destPath = path.join(class12Dir, destFile);

      if (fs.existsSync(destPath)) {
        console.log(`   ⏭️  ${subject}: already have ${destFile}`);
        skipped++;
        continue;
      }

      console.log(`   ${subject}:`);
      const candidates = makeCandidates(bases, config.sep);
      const ok = await tryCandidates(base12, candidates, destPath);
      if (ok) downloaded++;
      else { failed++; console.log(`     ❌ Not found for ${year}`); }
      await sleep(200);
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊 Historical Download Summary                          ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ Newly downloaded:    ${String(downloaded).padStart(3)}                             ║`);
  console.log(`║  ⏭️  Already present:    ${String(skipped).padStart(3)}                             ║`);
  console.log(`║  ❌ Could not find:      ${String(failed).padStart(3)}                             ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  console.log("\n📝 Next: Run 'node scripts/scan-papers.js' to register them.");
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
