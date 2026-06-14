// ═══════════════════════════════════════════════════════════
//  TutAR Books — ICSE QP Folder Inspector
//
//  READ-ONLY: Lists all files in your ICSE QP downloads folder
//  to help build the rename map. Does NOT modify anything.
//
//  Run with: node scripts/inspect-icse-folder.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const os = require("os");

// Try common locations for the ICSE QP folder
const POSSIBLE_LOCATIONS = [
  path.join(os.homedir(), "Downloads", "ICSE QP"),
  path.join(os.homedir(), "Downloads", "ICSE_QP"),
  path.join(os.homedir(), "Downloads", "ICSE-QP"),
  path.join(os.homedir(), "Downloads", "ICSE qp"),
  path.join(os.homedir(), "Downloads", "icse qp"),
];

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  🔍  TutAR Books — ICSE QP Folder Inspector              ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// Find the folder
let rootFolder = null;
for (const loc of POSSIBLE_LOCATIONS) {
  if (fs.existsSync(loc)) {
    rootFolder = loc;
    break;
  }
}

if (!rootFolder) {
  console.log("❌ Could not find 'ICSE QP' folder in Downloads.\n");
  console.log("Tried these paths:");
  POSSIBLE_LOCATIONS.forEach((p) => console.log(`   - ${p}`));
  console.log("\n💡 Tell me the exact folder name and I'll update the script.");
  process.exit(1);
}

console.log(`📁 Found folder: ${rootFolder}\n`);
console.log("═══════════════════════════════════════════════════════════\n");

function listFolder(folderPath, indent = 0) {
  const prefix = "   ".repeat(indent);
  let entries;
  try {
    entries = fs.readdirSync(folderPath);
  } catch (err) {
    console.log(`${prefix}❌ Cannot read folder: ${err.message}`);
    return;
  }

  // Sort: folders first, then files
  const folders = [];
  const files = [];
  for (const name of entries) {
    const fullPath = path.join(folderPath, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) folders.push(name);
      else if (name.toLowerCase().endsWith(".pdf")) files.push({ name, size: stat.size });
    } catch (err) {
      // skip
    }
  }

  folders.sort();
  files.sort((a, b) => a.name.localeCompare(b.name));

  // Print folders with their contents (recursive)
  for (const folder of folders) {
    console.log(`${prefix}📁 ${folder}/`);
    listFolder(path.join(folderPath, folder), indent + 1);
  }

  // Print files
  for (const file of files) {
    const sizeKb = (file.size / 1024).toFixed(0);
    console.log(`${prefix}   📄 ${file.name}  (${sizeKb} KB)`);
  }
}

listFolder(rootFolder);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("\n📋 INSTRUCTIONS:");
console.log("   Copy the output above and share it with me.");
console.log("   I'll build a rename map that converts your filenames");
console.log("   to match what TutAR Books expects, like:");
console.log("   • 'Mathematics-2024.pdf', 'Physics-2024.pdf', etc.");
