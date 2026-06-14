// ═══════════════════════════════════════════════════════════
//  TutAR Books — ICSE QP Auto-Renamer
//
//  Reads PDFs from C:\Users\LOQ\Downloads\ICSE QP\
//  Detects subjects from messy filenames
//  Copies to pdfs/ICSE/Class-{10,12}/papers/ with clean names
//
//  Run with: node scripts/rename-icse-papers.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const PDFS_DIR = path.join(ROOT, "pdfs");
const SOURCE_DIR = path.join(os.homedir(), "Downloads", "ICSE QP");

const CLASS_10_DEST = path.join(PDFS_DIR, "ICSE", "Class-10", "papers");
const CLASS_12_DEST = path.join(PDFS_DIR, "ICSE", "Class-12", "papers");

// ═══ SUBJECT DETECTION RULES ═══
// Order matters - more specific matches first

// Class X subject patterns (case-insensitive). Returns canonical subject name + paper number (if any)
const CLASS_10_RULES = [
  // English papers
  { match: /english.?p1|english.?paper.?1|english.?language/i, subject: "English_Paper_1" },
  { match: /english.?p2|english.?paper.?2|english.?literature/i, subject: "English_Paper_2" },
  { match: /\benglish\b/i, subject: "English_Paper_1" }, // fallback

  // Sciences (with paper number if any)
  { match: /physics.?paper.?2|physics.?p2|physics.?-?2/i, subject: "Physics_Paper_2" },
  { match: /\bphysics\b/i, subject: "Physics" },
  { match: /chemistry.?paper.?2|chemistry.?p2|chemistry.?-?2/i, subject: "Chemistry_Paper_2" },
  { match: /\bchemistry\b/i, subject: "Chemistry" },
  { match: /biology.?paper.?2|biology.?p2|biology.?-?2/i, subject: "Biology_Paper_2" },
  { match: /\bbiology\b/i, subject: "Biology" },

  // Math
  { match: /math/i, subject: "Mathematics" },

  // Languages
  { match: /sanskrit/i, subject: "Sanskrit" },
  { match: /\bhindi\b/i, subject: "Hindi" },

  // Social
  { match: /history.*civics|h\s*&\s*c|civics/i, subject: "History_and_Civics" },
  { match: /history/i, subject: "History_and_Civics" },
  { match: /geography/i, subject: "Geography" },

  // Computer
  { match: /computer.?app/i, subject: "Computer_Applications" },
  { match: /computer/i, subject: "Computer_Applications" },
];

// Class XII subject patterns. Codes are very stable indicators (801A, 860, etc.)
const CLASS_12_RULES = [
  // Use the official ISC subject codes when present
  { match: /\b801[Aa]\b/, subject: "English_Paper_1" },
  { match: /\b801[Bb]\b/, subject: "English_Paper_2" },
  { match: /\b805\b/, subject: "Hindi" },
  { match: /\b838\b/, subject: "Sanskrit" },
  { match: /\b851\b/, subject: "History" },
  { match: /\b852\b/, subject: "Political_Science" },
  { match: /\b853\b[Aa]?/, subject: "Geography" },
  { match: /\b854\b/, subject: "Sociology" },
  { match: /\b855\b/, subject: "Psychology" },
  { match: /\b856\b/, subject: "Economics" },
  { match: /\b857\b/, subject: "Commerce" },
  { match: /\b858\b/, subject: "Accountancy" },
  { match: /\b859\b/, subject: "Business_Studies" },
  { match: /\b860\b/, subject: "Mathematics" },
  { match: /\b861[Aa]\b/, subject: "Physics_Paper_1" },
  { match: /\b861[Bb]\b/, subject: "Physics_Paper_2" },
  { match: /\b862[Aa]\b/, subject: "Chemistry_Paper_1" },
  { match: /\b862[Bb]\b/, subject: "Chemistry_Paper_2" },
  { match: /\b862\s/, subject: "Chemistry_Paper_1" }, // "862 CHEMISTRY PAPER 1"
  { match: /\b863\s*[Aa]?\s/, subject: "Biology_Paper_1" },
  { match: /\b863[Bb]\b/, subject: "Biology_Paper_2" },
  { match: /\b868\s*[Aa]?\s|\b868\b/, subject: "Computer_Science_Paper_1" },
  { match: /\b868[Bb]\b/, subject: "Computer_Science_Paper_2" },

  // Fallback patterns (no code in filename)
  { match: /english.?paper.?1|english.?language/i, subject: "English_Paper_1" },
  { match: /english.?paper.?2|english.?literature/i, subject: "English_Paper_2" },
  { match: /physics.?paper.?1/i, subject: "Physics_Paper_1" },
  { match: /physics.?paper.?2/i, subject: "Physics_Paper_2" },
  { match: /chemistry.?paper.?1/i, subject: "Chemistry_Paper_1" },
  { match: /chemistry.?paper.?2/i, subject: "Chemistry_Paper_2" },
  { match: /biology.?paper.?1/i, subject: "Biology_Paper_1" },
  { match: /biology.?paper.?2/i, subject: "Biology_Paper_2" },
  { match: /computer.?science.?paper.?1|computer.?sc.?-?1/i, subject: "Computer_Science_Paper_1" },
  { match: /computer.?science.?paper.?2|computer.?sc.?-?2/i, subject: "Computer_Science_Paper_2" },
  { match: /mathematics/i, subject: "Mathematics" },
  { match: /hindi/i, subject: "Hindi" },
  { match: /history(?!.*hindi)/i, subject: "History" },
  { match: /pol.*?sc|political.?science/i, subject: "Political_Science" },
  { match: /geography/i, subject: "Geography" },
  { match: /sociology/i, subject: "Sociology" },
  { match: /psychology/i, subject: "Psychology" },
  { match: /economics/i, subject: "Economics" },
  { match: /commerce/i, subject: "Commerce" },
  { match: /accountancy|accounts/i, subject: "Accountancy" },
  { match: /business.?studies/i, subject: "Business_Studies" },
  { match: /sanskrit/i, subject: "Sanskrit" },
];

// Subjects we WANT (skip everything else)
const ALLOWED_SUBJECTS = new Set([
  "Mathematics", "English_Paper_1", "English_Paper_2", "Hindi", "Sanskrit",
  "Physics", "Physics_Paper_1", "Physics_Paper_2",
  "Chemistry", "Chemistry_Paper_1", "Chemistry_Paper_2",
  "Biology", "Biology_Paper_1", "Biology_Paper_2",
  "Computer_Applications", "Computer_Science_Paper_1", "Computer_Science_Paper_2",
  "History_and_Civics", "History", "Political_Science", "Geography",
  "Accountancy", "Business_Studies", "Commerce", "Economics",
  "Sociology", "Psychology",
]);

// Detects the year from folder name OR filename
function extractYear(folderName, filename) {
  const folderMatch = folderName.match(/20\d{2}/);
  if (folderMatch) return folderMatch[0];
  const fileMatch = filename.match(/20\d{2}/);
  if (fileMatch) return fileMatch[0];
  return null;
}

// Detects semester from filename (2022 had Sem 1/2)
function extractSemester(filename) {
  const m = filename.match(/sem(?:ester|seter)?\s*-?\s*(\d)/i);
  return m ? m[1] : null;
}

function detectSubject(filename, rules) {
  for (const rule of rules) {
    if (rule.match.test(filename)) return rule.subject;
  }
  return null;
}

function processClass(label, sourceDir, destDir, rules) {
  console.log(`\n═══════════════ ${label} ═══════════════\n`);

  if (!fs.existsSync(sourceDir)) {
    console.log(`⚠️  Source folder not found: ${sourceDir}`);
    return { mapped: 0, skipped: 0, unknown: [] };
  }

  fs.mkdirSync(destDir, { recursive: true });

  let mapped = 0;
  let skipped = 0;
  const unknown = [];

  // Walk year folders
  const yearFolders = fs.readdirSync(sourceDir).filter((f) =>
    fs.statSync(path.join(sourceDir, f)).isDirectory()
  );

  for (const yearFolder of yearFolders) {
    const yearPath = path.join(sourceDir, yearFolder);
    const year = extractYear(yearFolder, "");
    if (!year) {
      console.log(`⚠️  Can't detect year from: ${yearFolder}`);
      continue;
    }

    console.log(`📅 ${yearFolder} (year ${year})`);

    // Get all PDFs in this year folder (including subfolders for 2024)
    function collectPdfs(dir) {
      const out = [];
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          out.push(...collectPdfs(full));
        } else if (entry.toLowerCase().endsWith(".pdf")) {
          out.push(full);
        }
      }
      return out;
    }

    const pdfs = collectPdfs(yearPath);

    for (const srcPath of pdfs) {
      const filename = path.basename(srcPath);
      const subject = detectSubject(filename, rules);

      if (!subject || !ALLOWED_SUBJECTS.has(subject)) {
        unknown.push(filename);
        continue;
      }

      const semester = extractSemester(filename);
      const destName = semester
        ? `${subject}-${year}-Sem${semester}.pdf`
        : `${subject}-${year}.pdf`;

      const destPath = path.join(destDir, destName);

      if (fs.existsSync(destPath)) {
        console.log(`   ⏭️  ${destName} (already exists)`);
        skipped++;
        continue;
      }

      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✓ ${filename}  →  ${destName}`);
      mapped++;
    }
  }

  return { mapped, skipped, unknown };
}

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  🔄  TutAR Books — ICSE QP Auto-Renamer                  ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log(`📁 Source:  ${SOURCE_DIR}`);
console.log(`📁 Dest:    ${PDFS_DIR}\n`);

if (!fs.existsSync(SOURCE_DIR)) {
  console.error("❌ Source folder not found.");
  process.exit(1);
}

const class10Source = path.join(SOURCE_DIR, "class X");
const class12Source = path.join(SOURCE_DIR, "class XII");

const c10 = processClass("CLASS X (ICSE)", class10Source, CLASS_10_DEST, CLASS_10_RULES);
const c12 = processClass("CLASS XII (ISC)", class12Source, CLASS_12_DEST, CLASS_12_RULES);

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  📊 Rename Summary                                       ║");
console.log("╠══════════════════════════════════════════════════════════╣");
console.log(`║  📘 Class 10 mapped:    ${String(c10.mapped).padStart(3)}                            ║`);
console.log(`║  📕 Class 12 mapped:    ${String(c12.mapped).padStart(3)}                            ║`);
console.log(`║  ⏭️  Already existed:    ${String(c10.skipped + c12.skipped).padStart(3)}                            ║`);
console.log(`║  ❓ Skipped (unknown):  ${String(c10.unknown.length + c12.unknown.length).padStart(3)}                            ║`);
console.log("╚══════════════════════════════════════════════════════════╝");

if (c10.unknown.length || c12.unknown.length) {
  console.log("\n📝 Skipped files (not in our 21 main subjects):");
  for (const u of c10.unknown.slice(0, 10)) console.log(`   - ${u}`);
  for (const u of c12.unknown.slice(0, 10)) console.log(`   - ${u}`);
  const totalUnknown = c10.unknown.length + c12.unknown.length;
  if (totalUnknown > 20) console.log(`   ... and ${totalUnknown - 20} more (mostly regional languages, arts, music)`);
}

console.log("\n📝 Next step: Run 'node scripts/expand-papers-catalog.js' to update catalog");
console.log("              Then 'node scripts/scan-papers.js' to register the PDFs");
