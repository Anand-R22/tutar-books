// ───────────────────────────────────────────────────────────
// Textbook Library Server
// CBSE/ICSE textbooks + question papers for teachers
// ───────────────────────────────────────────────────────────

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// ───── Config ─────
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  PORT = 3001,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  console.error("   Copy .env.example to .env and fill in your Supabase credentials");
  process.exit(1);
}

// ───── Services ─────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ───── Load catalog ─────
const catalogPath = path.join(__dirname, "data", "books.json");
let catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

// Re-load catalog whenever the file changes (for dev)
fs.watchFile(catalogPath, { interval: 2000 }, () => {
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    console.log("📚 Catalog reloaded");
  } catch (e) {
    console.error("Failed to reload catalog:", e.message);
  }
});

// ───── App setup ─────
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Serve uploaded PDFs
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve downloaded NCERT PDFs
app.use("/pdfs", express.static(path.join(__dirname, "pdfs")));

// Multer config for PDF uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

// ───── Auth middleware ─────
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Not signed in" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Session expired" });

    req.user = data.user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Authentication failed" });
  }
}

// ───────────────────────────────────────────────────────────
// API ENDPOINTS
// ───────────────────────────────────────────────────────────

// PDF Proxy: fetches PDFs from external sources (like GitHub) and serves
// them with Content-Disposition: inline so the browser displays them in
// the embedded viewer instead of showing a download dialog.
// Usage: /pdf-proxy?url=ENCODED_GITHUB_URL
app.get("/pdf-proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url parameter");

    // Allow-list: only proxy from trusted hosts
    const allowedHosts = ["github.com", "objects.githubusercontent.com", "raw.githubusercontent.com"];
    let urlObj;
    try {
      urlObj = new URL(targetUrl);
    } catch {
      return res.status(400).send("Invalid URL");
    }
    if (!allowedHosts.some(h => urlObj.hostname === h || urlObj.hostname.endsWith("." + h))) {
      return res.status(403).send("Host not allowed");
    }

    console.log(`[proxy] Fetching ${targetUrl}`);
    const startTime = Date.now();

    // Fetch the PDF
    const response = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TutAR-Books/1.0)",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(`Upstream returned ${response.status}`);
    }

    // Set inline display headers
    const filename = path.basename(urlObj.pathname);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${filename}"`);
    res.set("Cache-Control", "public, max-age=86400"); // Cache for 1 day

    // Pass through Content-Length so browser shows progress
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.set("Content-Length", contentLength);

    // STREAM the response so the browser can start rendering pages
    // before the entire PDF has finished downloading. Critical for big files.
    const reader = response.body.getReader();

    const stream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // value is a Uint8Array — write it directly to the response
          if (!res.write(Buffer.from(value))) {
            // Backpressure: wait for drain before reading more
            await new Promise((resolve) => res.once("drain", resolve));
          }
        }
        res.end();
        console.log(`[proxy] Completed ${filename} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`[proxy] Stream error:`, err.message);
        if (!res.headersSent) res.status(500);
        res.end();
      }
    };

    // Handle client disconnect (user closed viewer mid-load)
    req.on("close", () => {
      reader.cancel().catch(() => {});
    });

    stream();
  } catch (err) {
    console.error("PDF proxy error:", err.message);
    if (!res.headersSent) res.status(500).send("Proxy error: " + err.message);
  }
});

// Public: serve Supabase config to the browser
// (Anon key is safe to expose — protected by RLS)
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(`window.SUPABASE_URL = "${SUPABASE_URL}";\nwindow.SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY || ""}";`);
});

// Public: get the catalog structure (boards/classes/subjects)
app.get("/api/catalog", (req, res) => {
  // Build a compact list of which subjects exist for each board+class in
  // textbooks vs question papers — so the frontend can populate the subject
  // dropdown dynamically based on what's actually available.
  const subjectsByBoardClass = { library: {}, papers: {} };

  for (const b of catalog.textbooks || []) {
    const key = `${b.board}|${b.class}`;
    if (!subjectsByBoardClass.library[key]) subjectsByBoardClass.library[key] = [];
    if (!subjectsByBoardClass.library[key].includes(b.subject)) {
      subjectsByBoardClass.library[key].push(b.subject);
    }
  }
  for (const p of catalog.questionPapers || []) {
    const key = `${p.board}|${p.class}`;
    if (!subjectsByBoardClass.papers[key]) subjectsByBoardClass.papers[key] = [];
    if (!subjectsByBoardClass.papers[key].includes(p.subject)) {
      subjectsByBoardClass.papers[key].push(p.subject);
    }
  }
  // Sort all subject lists
  for (const view of ["library", "papers"]) {
    for (const key of Object.keys(subjectsByBoardClass[view])) {
      subjectsByBoardClass[view][key].sort();
    }
  }

  res.json({
    boards: catalog.boards,
    classes: catalog.classes,
    subjects: catalog.subjects, // legacy fallback
    subjectsByBoardClass,
  });
});

// Public: list textbooks for a given board + class + subject
app.get("/api/textbooks", (req, res) => {
  const { board, class: cls, subject } = req.query;

  let results = catalog.textbooks.filter((b) => {
    if (board && b.board !== board) return false;
    if (cls && b.class !== cls) return false;
    if (subject && b.subject !== subject) return false;
    return true;
  });

  res.json({ count: results.length, books: results });
});

// Public: list question papers
app.get("/api/question-papers", (req, res) => {
  const { board, class: cls, subject } = req.query;

  let results = catalog.questionPapers.filter((b) => {
    if (board && b.board !== board) return false;
    if (cls && b.class !== cls) return false;
    if (subject && b.subject !== subject) return false;
    return true;
  });

  // Sort newest year first
  results.sort((a, b) => parseInt(b.year) - parseInt(a.year));

  res.json({ count: results.length, papers: results });
});

// Authenticated: list user's uploaded PDFs
app.get("/api/my-uploads", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("user_uploads")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not fetch uploads — table might not exist yet:", error.message);
    return res.json({ uploads: [] });
  }

  res.json({ uploads: data || [] });
});

// Authenticated: upload a PDF (textbook or question paper)
app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { title, board, class: cls, subject, year, kind } = req.body;
    if (!title || !board || !cls || !subject || !kind) {
      // Cleanup the uploaded file since metadata is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Missing required fields" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    // Save metadata to Supabase
    const { data, error } = await supabaseAdmin
      .from("user_uploads")
      .insert({
        user_id: req.user.id,
        title,
        board,
        class: cls,
        subject,
        year: year || null,
        kind, // 'textbook' or 'question-paper'
        file_url: fileUrl,
        original_name: req.file.originalname,
      })
      .select()
      .single();

    if (error) {
      console.error("DB insert failed:", error.message);
      // File is still saved; return basic info
      return res.json({
        upload: {
          id: req.file.filename,
          title,
          board,
          class: cls,
          subject,
          year,
          kind,
          file_url: fileUrl,
          uploaded_locally: true,
        },
        warning: "Saved file locally but database record failed. Create the user_uploads table in Supabase.",
      });
    }

    res.json({ upload: data });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Authenticated: delete an uploaded PDF
app.delete("/api/uploads/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const { data: rec, error: fetchErr } = await supabaseAdmin
    .from("user_uploads")
    .select("*")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (fetchErr || !rec) return res.status(404).json({ error: "Not found" });

  // Delete the file
  const filePath = path.join(__dirname, rec.file_url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Delete the DB record
  await supabaseAdmin.from("user_uploads").delete().eq("id", id);

  res.json({ deleted: true });
});

// ───── Start server ─────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  📚 Textbook Library Server                                ║
║                                                            ║
║  Running at:  http://localhost:${PORT}${" ".repeat(28 - String(PORT).length)}║
║  Catalog:     ${catalog.textbooks.length} textbooks, ${catalog.questionPapers.length} question papers${" ".repeat(Math.max(0, 14 - String(catalog.textbooks.length).length - String(catalog.questionPapers.length).length))}║
╚════════════════════════════════════════════════════════════╝
  `);
});
