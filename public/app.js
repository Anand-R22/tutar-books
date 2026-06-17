// ═══════════════════════════════════════════════════════
// TutAR Books — Frontend logic
// Auth · Browse · Viewer · Upload
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = window.SUPABASE_URL || prompt("Supabase URL is missing. Please set in your .env and reload.");
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || prompt("Supabase anon key is missing.");

// Initialize Supabase (loaded via CDN)
const sb = window.supabase.createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-key"
);

// ───── State ─────
let currentUser = null;
let catalog = null;          // { boards, classes, subjects }
let currentView = "library"; // "library" | "papers" | "my-uploads"
let currentFilter = { board: "CBSE", class: "6", subject: "Mathematics" };

// ───── DOM Helpers ─────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

function toast(message, type = "default") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = "toast", 3000);
}

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    enterApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  show($("#authScreen"));
  hide($("#mainApp"));
}

function enterApp() {
  hide($("#authScreen"));
  show($("#mainApp"));
  $("#userEmail").textContent = currentUser.email;
  loadCatalog();
}

// Tab switcher
$$(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Update active state on tabs
    $$(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    // Switch forms (use explicit display values to avoid browser quirks)
    const which = tab.dataset.tab;
    const loginForm = $("#loginForm");
    const signupForm = $("#signupForm");

    if (which === "signup") {
      loginForm.style.display = "none";
      signupForm.style.display = "flex";
      // Clear any prior error messages
      $("#loginError").textContent = "";
      $("#signupError").textContent = "";
      $("#signupError").style.color = "";
    } else {
      loginForm.style.display = "flex";
      signupForm.style.display = "none";
      $("#loginError").textContent = "";
      $("#signupError").textContent = "";
    }
  });
});

// Login
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("#loginError");
  errorEl.textContent = "";

  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  currentUser = data.user;
  enterApp();
});

// Signup
$("#signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("#signupError");
  errorEl.textContent = "";

  const name = $("#signupName").value.trim();
  const email = $("#signupEmail").value.trim();
  const password = $("#signupPassword").value;

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  if (data.user && !data.session) {
    // Email confirmation required
    errorEl.style.color = "var(--moss)";
    errorEl.textContent = "Check your email to confirm your account, then sign in.";
    return;
  }

  currentUser = data.user;
  enterApp();
});

// Sign out
$("#signoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  currentUser = null;
  location.reload();
});

// ═══════════════════════════════════════════════════════
// CATALOG / FILTERS
// ═══════════════════════════════════════════════════════

async function loadCatalog() {
  try {
    const res = await fetch("/api/catalog");
    catalog = await res.json();
    populateFilters();
    loadResults();
  } catch (err) {
    toast("Failed to load catalog", "error");
  }
}

function populateFilters() {
  // Class dropdown
  const classSel = $("#classFilter");
  classSel.innerHTML = catalog.classes
    .map((c) => `<option value="${c}" ${c === currentFilter.class ? "selected" : ""}>${c === "KG" ? "KG" : "Class " + c}</option>`)
    .join("");

  // Also populate upload class dropdown
  $("#uploadClass").innerHTML = catalog.classes
    .map((c) => `<option value="${c}">${c === "KG" ? "KG" : "Class " + c}</option>`)
    .join("");

  populateSubjects();
}

// Collapses subject variants into a single base subject so the dropdown
// shows one entry instead of many:
//   "Biology Paper 1" / "Biology Paper 2"   -> "Biology"
//   "Biology Part 1" / "Biology Part 4"     -> "Biology"
// Plain subjects (no suffix) pass through unchanged.
function baseSubject(s) {
  return String(s || "")
    .replace(/\s+Paper\s*\d+\s*$/i, "")
    .replace(/\s+Part\s*\d+\s*$/i, "")
    .trim();
}

function populateSubjects() {
  // Pull subjects from the live data for the current view + board + class.
  // - "papers" view: use questionPapers subjects, collapsed by baseSubject so
  //   "Biology Paper 1" and "Biology Paper 2" appear once as "Biology".
  // - "library" view: use textbook subjects as-is.
  // - "my-uploads" view: union of both, also collapsed.
  const { board, class: cls } = currentFilter;
  const key = `${board}|${cls}`;

  let subjects = [];
  const subjMap = catalog.subjectsByBoardClass || {};

  if (currentView === "papers") {
    const raw = subjMap.papers?.[key] || [];
    subjects = Array.from(new Set(raw.map(baseSubject))).sort();
  } else if (currentView === "library") {
    // Collapse "Biology Part 1..4" to a single "Biology" dropdown entry
    const raw = subjMap.library?.[key] || [];
    subjects = Array.from(new Set(raw.map(baseSubject))).sort();
  } else {
    // my-uploads: union of textbook + paper subjects (both collapsed)
    const set = new Set([
      ...(subjMap.library?.[key] || []).map(baseSubject),
      ...(subjMap.papers?.[key] || []).map(baseSubject),
    ]);
    subjects = Array.from(set).sort();
  }

  // Fallback to legacy hardcoded list if dynamic lookup found nothing
  if (subjects.length === 0) {
    subjects = catalog.subjects?.[cls] || [];
  }

  const subjSel = $("#subjectFilter");
  subjSel.innerHTML = subjects
    .map((s) => `<option value="${s}" ${s === currentFilter.subject ? "selected" : ""}>${s}</option>`)
    .join("");

  // If current subject isn't in the new list, reset to the first available
  if (!subjects.includes(currentFilter.subject) && subjects.length) {
    currentFilter.subject = subjects[0];
  }
}

// Board filter
$$("#boardFilter .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#boardFilter .seg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter.board = btn.dataset.value;
    populateSubjects();  // refresh subjects for new board
    loadResults();
  });
});

// Class filter
$("#classFilter").addEventListener("change", (e) => {
  currentFilter.class = e.target.value;
  populateSubjects();
  loadResults();
});

// Subject filter
$("#subjectFilter").addEventListener("change", (e) => {
  currentFilter.subject = e.target.value;
  loadResults();
});

// View tabs
$$(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    populateSubjects();  // dropdown changes between library/papers views
    loadResults();
  });
});

// ═══════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════

async function loadResults() {
  // If viewer is open, close it before showing new results
  const viewerSection = $("#viewerSection");
  if (viewerSection && viewerSection.style.display !== "none") {
    closeViewer();
  }

  const { board, class: cls, subject } = currentFilter;

  // Update title
  const classLabel = cls === "KG" ? "KG" : `Class ${cls}`;
  let titleText;
  if (currentView === "my-uploads") {
    titleText = "My uploaded PDFs";
  } else if (currentView === "papers") {
    titleText = `${classLabel} · ${subject} · ${board} — Question Papers`;
  } else {
    titleText = `${classLabel} · ${subject} · ${board}`;
  }
  $("#resultsTitle").textContent = titleText;

  let items = [];
  let kind = "textbook";

  if (currentView === "library") {
    // Fetch by board+class only — collapse "Biology Part 1..4" so picking
    // "Biology" returns all four parts in one card grid.
    const res = await fetch(`/api/textbooks?board=${board}&class=${cls}`);
    const data = await res.json();
    items = (data.books || []).filter((b) => baseSubject(b.subject) === subject);

    // Sort so "Biology Part 1" precedes "Part 2" (alphabetic on full subject)
    items.sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
  } else if (currentView === "papers") {
    // Fetch by board+class only (no subject filter) — then collapse Paper 1/2
    // variants on the client so "Biology" shows both papers under one group.
    const res = await fetch(`/api/question-papers?board=${board}&class=${cls}`);
    const data = await res.json();
    items = (data.papers || []).filter((p) => baseSubject(p.subject) === subject);

    // Sort: newest year first, then Paper 1 before Paper 2.
    // Years like "2022-Sem1" sort naturally after stripping non-numeric prefix.
    items.sort((a, b) => {
      const yearCmp = String(b.year).localeCompare(String(a.year));
      if (yearCmp !== 0) return yearCmp;
      return String(a.subject).localeCompare(String(b.subject));
    });

    kind = "question-paper";
  } else if (currentView === "my-uploads") {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/my-uploads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    items = data.uploads;
    kind = "user-upload";
  }

  renderItems(items, kind);
}

function renderItems(items, kind) {
  const grid = $("#resultsGrid");
  const empty = $("#emptyState");

  $("#resultsCount").textContent = items.length === 0
    ? ""
    : `${items.length} ${items.length === 1 ? "item" : "items"}`;

  if (items.length === 0) {
    grid.innerHTML = "";
    setEmptyState(kind);
    show(empty);
    return;
  }

  hide(empty);
  grid.innerHTML = items.map((b) => bookCardHTML(b, kind)).join("");

  // Click handlers
  grid.querySelectorAll(".book-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) return;
      const itemId = card.dataset.id;
      const item = items.find((b) => String(b.id) === String(itemId));
      if (item) openViewer(item, kind);
    });
  });

  // Delete handlers for user uploads
  grid.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm("Delete this PDF?")) return;
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/uploads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast("Deleted", "success");
        loadResults();
      } else {
        toast("Could not delete", "error");
      }
    });
  });
}

// Sets the right empty-state message depending on context (ICSE vs CBSE vs My Uploads)
function setEmptyState(kind) {
  const art = $("#emptyArt");
  const title = $("#emptyTitle");
  const text = $("#emptyText");
  const action = $("#emptyUploadBtn");
  const { board, class: cls } = currentFilter;

  // Question Papers — only Class 10 and 12 have board exams in India
  const isBoardExamClass = cls === "10" || cls === "12";

  if (currentView === "my-uploads") {
    art.textContent = "📥";
    title.textContent = "You haven't uploaded anything yet";
    text.innerHTML = "Add your own PDFs to use them anytime.<br/>They're private — only you can see them.";
    action.style.display = "inline-flex";
  } else if (currentView === "papers" && !isBoardExamClass) {
    // No board exams for KG-9 or Class 11 — each school sets its own internal exams
    art.textContent = "📝";
    title.textContent = "No public question papers for this class";
    text.innerHTML = `Only <strong>Class 10 and Class 12</strong> have official board exams in India. For Class ${cls === "KG" ? "KG" : cls}, schools set their own internal exam papers.<br/><br/>Upload your school's papers here to keep them organized.`;
    action.style.display = "inline-flex";
  } else if (board === "ICSE" && currentView === "library") {
    // Honest message about ICSE
    art.textContent = "📖";
    title.textContent = "ICSE textbooks aren't publicly available";
    text.innerHTML = "ICSE books are published by private publishers like <strong>Selina, ML Aggarwal, and Frank Brothers</strong> — they aren't free to distribute.<br/><br/>Upload your school's textbook PDF here and it'll be available whenever you need it.";
    action.style.display = "inline-flex";
  } else if (currentView === "papers" && board === "ICSE") {
    art.textContent = "📝";
    title.textContent = "No ICSE specimen papers found for this selection";
    text.innerHTML = "Try a different class or subject, or upload your own previous-year paper.";
    action.style.display = "inline-flex";
  } else if (currentView === "papers") {
    art.textContent = "📝";
    title.textContent = "No question papers in our library yet";
    text.innerHTML = "We're still gathering board exam papers for this subject.<br/>Upload yours below to add it to your library.";
    action.style.display = "inline-flex";
  } else {
    art.textContent = "📚";
    title.textContent = "No books here yet";
    text.innerHTML = "We don't have this combination in our library yet.<br/>You can upload your own PDF using the button below.";
    action.style.display = "inline-flex";
  }
}

function bookCardHTML(b, kind) {
  const board = b.board || "";
  const cls = b.class || "";
  const classLabel = cls === "KG" ? "KG" : `Cl. ${cls}`;

  const year = b.year || "";
  const yearBadge = year ? `<span class="meta-tag">${year}</span>` : "";

  // If we have a local file_url (downloaded), it embeds. External NCERT links open new tab.
  const hasLocalPdf = b.file_url && b.file_url.startsWith("/");
  const url = b.file_url || b.url || b.viewerUrl || "";
  const isExternalOnly = !hasLocalPdf && (
    url.includes("ncert.nic.in") || url.includes("cbse.gov.in") || url.includes("cisce.org")
  );
  const actionText = isExternalOnly ? "Open ↗" : "View PDF";

  const deleteBtn = kind === "user-upload"
    ? `<button type="button" class="delete-btn" data-id="${b.id}" title="Delete">Delete</button>`
    : `<span class="book-year">${b.year || ""}</span>`;

  return `
    <article class="book-card" data-board="${board}" data-id="${b.id}">
      <div class="book-spine"></div>
      <div class="book-body">
        <div>
          <div class="book-meta-top">
            <span class="meta-tag board-tag">${board}</span>
            <span class="meta-tag">${classLabel}</span>
            ${yearBadge}
          </div>
          <h3 class="book-title">${escapeHtml(b.title)}</h3>
          <p class="book-publisher">${escapeHtml(b.publisher || b.subject || "")}</p>
        </div>
        <div class="book-actions">
          <button type="button" class="book-view-btn">${actionText}</button>
          ${deleteBtn}
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ═══════════════════════════════════════════════════════
// VIEWER MODAL
// ═══════════════════════════════════════════════════════

function openViewer(item, kind) {
  // Determine the PDF URL — prefer local file_url over external viewerUrl
  let pdfUrl = item.file_url || item.url || item.viewerUrl;

  // For user uploads or downloaded NCERT PDFs (local /pdfs/ or /uploads/), make absolute
  if (pdfUrl.startsWith("/")) {
    pdfUrl = window.location.origin + pdfUrl;
  }

  // Determine handling:
  // - Local files (uploads, downloaded PDFs) → embed directly
  // - GitHub Release URLs → route through our /pdf-proxy to get inline display
  // - External NCERT/CBSE/ICSE pages → open in new tab (X-Frame-Options blocks iframe)
  const isLocal = pdfUrl.startsWith(window.location.origin);
  const isGitHubRelease = pdfUrl.includes("github.com") && pdfUrl.includes("/releases/download/");
  const isBlockedExternal = pdfUrl.includes("ncert.nic.in") ||
                             pdfUrl.includes("cbse.gov.in") ||
                             pdfUrl.includes("cisce.org");

  if (!isLocal && !isGitHubRelease && isBlockedExternal) {
    // Open external NCERT/CBSE/ICSE pages in new tab
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
    toast(`Opening ${item.title} in a new tab…`, "default");
    return;
  }

  // For GitHub Release URLs, route through our /pdf-proxy endpoint.
  // Our server fetches the PDF and serves it with Content-Disposition: inline,
  // which makes the browser display it in the iframe instead of downloading.
  let embedUrl = pdfUrl;
  if (isGitHubRelease) {
    embedUrl = `${window.location.origin}/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
  }

  // Show inline viewer — replaces the library grid
  $("#viewerTitle").textContent = item.title;
  $("#viewerMeta").textContent = `${item.board} · ${item.class === "KG" ? "KG" : "Class " + item.class} · ${item.subject}${item.year ? " · " + item.year : ""}`;

  // Show loading spinner; hide iframe until it loads
  const loadingEl = $("#viewerLoading");
  const frameEl = $("#viewerFrame");
  loadingEl.style.display = "flex";
  frameEl.style.visibility = "hidden";
  frameEl.onload = () => {
    loadingEl.style.display = "none";
    frameEl.style.visibility = "visible";
  };

  frameEl.src = embedUrl;
  $("#viewerOpenNew").href = pdfUrl;       // Direct GitHub link
  $("#viewerDownload").href = pdfUrl;      // Direct GitHub link

  // Hide library, show viewer
  hide($(".filter-bar"));
  hide($(".results-area"));
  show($("#viewerSection"));

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeViewer() {
  hide($("#viewerSection"));
  show($(".filter-bar"));
  show($(".results-area"));
  $("#viewerFrame").src = "about:blank";
}

$("#viewerBack").addEventListener("click", closeViewer);

// ESC key to close viewer
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#viewerSection").style.display !== "none") {
    closeViewer();
  }
});

// ═══════════════════════════════════════════════════════
// UPLOAD MODAL
// ═══════════════════════════════════════════════════════

function openUploadModal() {
  // Pre-fill modal with current filters
  $("#uploadBoard").value = currentFilter.board;
  $("#uploadClass").value = currentFilter.class;
  $("#uploadSubject").value = currentFilter.subject;
  // If user is viewing question papers, default the kind dropdown
  if (currentView === "papers") {
    $("#uploadKind").value = "question-paper";
    show($("#uploadYearLabel"));
  } else {
    $("#uploadKind").value = "textbook";
    hide($("#uploadYearLabel"));
  }
  show($("#uploadModal"));
}

$("#uploadBtn").addEventListener("click", openUploadModal);
$("#emptyUploadBtn").addEventListener("click", openUploadModal);

$$("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    hide($("#uploadModal"));
    $("#uploadForm").reset();
    $("#fileName").textContent = "";
    $("#uploadError").textContent = "";
  });
});

$("#uploadModal").addEventListener("click", (e) => {
  if (e.target.id === "uploadModal") {
    hide($("#uploadModal"));
  }
});

// Show "Year" field only for question papers
$("#uploadKind").addEventListener("change", (e) => {
  const yearLabel = $("#uploadYearLabel");
  if (e.target.value === "question-paper") {
    show(yearLabel);
  } else {
    hide(yearLabel);
  }
});

// File select
$("#uploadFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  $("#fileName").textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "";
});

// Submit upload
$("#uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("#uploadError");
  errorEl.textContent = "";

  const file = $("#uploadFile").files[0];
  if (!file) {
    errorEl.textContent = "Please choose a PDF file";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", $("#uploadTitle").value.trim());
  formData.append("board", $("#uploadBoard").value);
  formData.append("class", $("#uploadClass").value);
  formData.append("subject", $("#uploadSubject").value.trim());
  formData.append("year", $("#uploadYear").value.trim() || "");
  formData.append("kind", $("#uploadKind").value);

  const submitBtn = $("#uploadSubmit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  try {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Upload failed";
      return;
    }

    if (data.warning) {
      toast(data.warning, "default");
    } else {
      toast("Uploaded successfully", "success");
    }

    hide($("#uploadModal"));
    $("#uploadForm").reset();
    $("#fileName").textContent = "";

    // Switch to My Uploads tab to show the new file
    $$(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('.nav-btn[data-view="my-uploads"]').classList.add("active");
    currentView = "my-uploads";
    loadResults();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload";
  }
});

// ═══════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════

checkSession();
