// ═══════════════════════════════════════════════════════════
//  TutAR Books — PDF Size Audit
//
//  Checks the size of every textbook on GitHub Releases
//  (via HTTP HEAD requests — no downloads needed).
//  Flags any over 50 MB which would fail Notebook's upload limit.
//
//  Run with: node scripts/audit-pdf-sizes.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");
const LIMIT_MB = 50;

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  📏  TutAR Books — PDF Size Audit                        ║");
console.log("║      Threshold: 50 MB (Notebook upload limit)            ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const textbooks = (catalog.textbooks || []).filter((b) => b.file_url);

console.log(`📚 Checking ${textbooks.length} textbooks on GitHub...\n`);

async function getSize(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status };
    const len = res.headers.get("content-length");
    return { ok: true, bytes: len ? parseInt(len, 10) : null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

(async () => {
  const oversized = [];
  const undersized = [];
  const failed = [];

  for (let i = 0; i < textbooks.length; i++) {
    const b = textbooks[i];
    const result = await getSize(b.file_url);
    const sizeMb = result.bytes ? (result.bytes / 1024 / 1024).toFixed(1) : "?";
    const label = `${b.board} Class ${b.class} ${b.subject}`;

    if (!result.ok) {
      console.log(`  ❌ ${label}  →  failed (${result.status || result.error})`);
      failed.push({ ...b, reason: result.status || result.error });
    } else if (result.bytes && result.bytes > LIMIT_MB * 1024 * 1024) {
      console.log(`  ⚠️  ${label}  →  ${sizeMb} MB  (OVERSIZED)`);
      oversized.push({ ...b, sizeMb });
    } else {
      console.log(`  ✓  ${label}  →  ${sizeMb} MB`);
      undersized.push({ ...b, sizeMb });
    }
  }

  const totalMb = [...undersized, ...oversized]
    .reduce((s, b) => s + parseFloat(b.sizeMb || 0), 0)
    .toFixed(0);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  📊  Summary                                             ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  ✓  Under 50 MB:    ${String(undersized.length).padStart(3)}                              ║`);
  console.log(`║  ⚠️  Over 50 MB:    ${String(oversized.length).padStart(3)}                              ║`);
  console.log(`║  ❌  Failed:         ${String(failed.length).padStart(3)}                              ║`);
  console.log(`║  📦  Total size:    ${String(totalMb).padStart(4)} MB                          ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  if (oversized.length > 0) {
    console.log("⚠️  Oversized textbooks (need special handling):");
    for (const b of oversized) {
      console.log(`   • ${b.board} Class ${b.class} ${b.subject}: ${b.sizeMb} MB`);
    }
    console.log("");
  }

  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    limit_mb: LIMIT_MB,
    counts: {
      under: undersized.length,
      over: oversized.length,
      failed: failed.length,
    },
    oversized,
    failed,
  };
  fs.writeFileSync(path.join(ROOT, "size-audit.json"), JSON.stringify(report, null, 2));
  console.log("📝 Detailed report saved to size-audit.json");
})();
