// ═══════════════════════════════════════════════════════════
//  TutAR Books — Switch to GitHub Release URLs (v3)
//
//  Usage:
//    node scripts/use-github-urls.js              (textbooks, fast)
//    node scripts/use-github-urls.js --verify     (textbooks, verified)
//    node scripts/use-github-urls.js --papers     (papers, fast)
//    node scripts/use-github-urls.js --papers --verify
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "books.json");

// ═══ EDIT THESE IF YOUR REPO IS DIFFERENT ═══
const GITHUB_USER = "Anand-R22";
const GITHUB_REPO = "tutar-books";
const TEXTBOOK_TAG = "v1.0-textbooks";
const PAPERS_TAG = "v2.0-questionpapers";
// ════════════════════════════════════════════

const VERIFY_URLS = process.argv.includes("--verify");
const IS_PAPERS = process.argv.includes("--papers");

const RELEASE_TAG = IS_PAPERS ? PAPERS_TAG : TEXTBOOK_TAG;
const BASE_URL = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`;

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "_");
}

async function urlExists(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function main() {
  const mode = IS_PAPERS ? "Question Papers" : "Textbooks";
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log(`║  ☁️  TutAR Books — GitHub Sync (${mode.padEnd(15)})  ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log(`📦 Release: ${BASE_URL}`);
  console.log(VERIFY_URLS ? `🔎 Verifying each URL with HEAD request` : `⚡ Fast mode. Pass --verify to check each URL.`);
  console.log("");

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const items = IS_PAPERS ? (catalog.questionPapers || []) : (catalog.textbooks || []);

  let assigned = 0, missing = 0, verified = 0;

  console.log(`🔄 Processing ${items.length} ${mode.toLowerCase()}...\n`);

  for (const item of items) {
    const subjectSafe = safeName(item.subject);
    const filename = IS_PAPERS
      ? `${item.board}-Class-${item.class}-${subjectSafe}-${item.year}.pdf`
      : `${item.board}-Class-${item.class}-${subjectSafe}.pdf`;
    const githubUrl = `${BASE_URL}/${filename}`;

    if (VERIFY_URLS) {
      process.stdout.write(`  Checking ${filename} ... `);
      const exists = await urlExists(githubUrl);
      if (exists) {
        item.file_url = githubUrl;
        assigned++;
        verified++;
        console.log("✓");
      } else {
        if (item.file_url && item.file_url.includes("github.com")) delete item.file_url;
        missing++;
        console.log("✗ (not on GitHub)");
      }
    } else {
      item.file_url = githubUrl;
      assigned++;
    }
  }

  if (IS_PAPERS) {
    catalog.questionPapers = items;
    catalog._meta.lastPapersSync = new Date().toISOString();
  } else {
    catalog.textbooks = items;
    catalog._meta.lastGitHubSync = new Date().toISOString();
  }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  📊 Summary                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  ✅ Assigned GitHub URL:  ${String(assigned).padStart(3)}                            ║`);
  if (VERIFY_URLS) {
    console.log(`║  🔍 Verified existing:    ${String(verified).padStart(3)}                            ║`);
    console.log(`║  ❌ Not found on GitHub:  ${String(missing).padStart(3)}                            ║`);
  }
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`\n🌍 ${mode} updated to use GitHub Release URLs!`);
  console.log("📝 Restart your server (npm start) and hard refresh to test.");

  if (!VERIFY_URLS) {
    console.log("\n💡 TIP: Add --verify to confirm each URL exists:");
    console.log(`   node scripts/use-github-urls.js ${IS_PAPERS ? "--papers " : ""}--verify`);
  }
}

main().catch((err) => { console.error("❌ Error:", err); process.exit(1); });
