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
//   "Biology Paper 1" / "Biology Paper 2"        -> "Biology"
//   "Biology Part 1" / "Biology Part 4"          -> "Biology"
//   "Biology Part 2A" / "Biology Part 2B"        -> "Biology"
// Plain subjects (no suffix) pass through unchanged.
function baseSubject(s) {
  return String(s || "")
    .replace(/\s+Paper\s*\d+[A-Z]?\s*$/i, "")
    .replace(/\s+Part\s*\d+[A-Z]?\s*$/i, "")
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

  // Set up the AI panel for this textbook
  setupAiPanel(item, kind);

  // Reset both scrolls BEFORE locking the body
  window.scrollTo({ top: 0, behavior: "instant" });

  // Hide library, show viewer
  hide($(".filter-bar"));
  hide($(".results-area"));
  show($("#viewerSection"));

  // Lock body scroll so warm-paper background doesn't show below viewer
  document.body.style.overflow = "hidden";
}

function closeViewer() {
  hide($("#viewerSection"));
  show($(".filter-bar"));
  show($(".results-area"));
  $("#viewerFrame").src = "about:blank";
  document.body.style.overflow = "";   // restore scrolling
  resetAiPanel();
}

// ═══════════════════════════════════════════════════════
// AI ASSISTANT PANEL
// ═══════════════════════════════════════════════════════

let currentAiContext = null;  // { item, kind } — what the panel is currently bound to
let aiPanelOpen = false;       // is the right-side panel currently visible?

function setupAiPanel(item, kind) {
  currentAiContext = { item, kind };

  // Show the AI panel only for library textbooks. Question papers and user
  // uploads aren't tied to a Notebook book_id.
  const isLibraryBook = kind === "library" || kind === "textbook";
  const hasAiIntegration = !!item.notebook_book_id && !item.ai_unavailable;

  // Reset all sub-panels to baseline
  hide($("#aiLoading"));
  hide($("#aiError"));
  hide($("#aiResults"));
  hide($("#aiUnavailable"));
  hide($("#aiSuggestions"));
  show($("#aiInput"));
  $("#aiTopic").value = "";
  $("#aiSuggestionChips").innerHTML = "";

  const toggleBtn = $("#aiToggleBtn");

  if (!isLibraryBook) {
    // Hide both the panel AND the toggle button for non-textbooks
    closeAiPanel();
    if (toggleBtn) toggleBtn.style.display = "none";
    return;
  }

  // Library book — show the toggle button so teacher can open AI
  if (toggleBtn) toggleBtn.style.display = "inline-flex";

  // Start with the panel CLOSED. Teacher opens it deliberately.
  closeAiPanel();

  if (!hasAiIntegration) {
    // Inside the (still-hidden) panel, swap input area for "coming soon" banner.
    // It'll appear correctly when teacher clicks the toggle.
    hide($("#aiInput"));
    show($("#aiUnavailable"));
    return;
  }

  // Pre-fetch suggestions in the background so chips are ready when the panel opens.
  fetchAiSuggestions(item.notebook_book_id);
}

function openAiPanel() {
  if (aiPanelOpen) return;
  aiPanelOpen = true;
  $("#viewerSplit")?.classList.add("ai-panel-open");
  const btn = $("#aiToggleBtn");
  if (btn) {
    btn.classList.add("ai-toggle-active");
    btn.setAttribute("aria-label", "Hide AI Assistant");
    const label = btn.querySelector(".ai-toggle-label");
    if (label) label.textContent = "Hide AI";
  }
}

function closeAiPanel() {
  aiPanelOpen = false;
  $("#viewerSplit")?.classList.remove("ai-panel-open");
  const btn = $("#aiToggleBtn");
  if (btn) {
    btn.classList.remove("ai-toggle-active");
    btn.setAttribute("aria-label", "Open AI Assistant");
    const label = btn.querySelector(".ai-toggle-label");
    if (label) label.textContent = "AI Assistant";
  }
  // Clear panel content so re-opening shows a fresh input form, not stale results.
  // Only reset if we have a current AI context (a library book is loaded);
  // otherwise we'd wipe the "AI unavailable" banner for unsupported items.
  if (currentAiContext) {
    resetAiPanelContent();
  }
}

// Returns the AI panel to its baseline "input" state — clears any previous
// results, hides loading/error states, empties the topic field. Called when
// the user closes the panel so the next open feels fresh.
function resetAiPanelContent() {
  hide($("#aiLoading"));
  hide($("#aiError"));
  hide($("#aiResults"));
  hide($("#aiUnavailable"));

  const item = currentAiContext?.item;
  const hasAi = item && !!item.notebook_book_id && !item.ai_unavailable;

  if (hasAi) {
    show($("#aiInput"));
    const topicInput = $("#aiTopic");
    if (topicInput) topicInput.value = "";
  } else {
    // Book doesn't have AI integration — show the "coming soon" banner
    hide($("#aiInput"));
    show($("#aiUnavailable"));
  }
}

function toggleAiPanel() {
  if (aiPanelOpen) closeAiPanel();
  else openAiPanel();
}

async function fetchAiSuggestions(bookId) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api/ai-suggestions?bookId=${encodeURIComponent(bookId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;  // Silently no chips
    const data = await res.json();
    const topics = Array.isArray(data.topics) ? data.topics : [];
    if (topics.length === 0) return;
    renderSuggestionChips(topics);
  } catch (err) {
    // Don't show error to user — chips are optional
    console.warn("Couldn't fetch suggestions:", err);
  }
}

function renderSuggestionChips(topics) {
  const container = $("#aiSuggestionChips");
  container.innerHTML = topics.map((t) =>
    `<button type="button" class="ai-chip" data-topic="${escapeAttr(t)}">${escapeText(t)}</button>`
  ).join("");
  show($("#aiSuggestions"));

  // Wire each chip
  container.querySelectorAll(".ai-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const topic = chip.dataset.topic;
      $("#aiTopic").value = topic;
      $("#aiTopic").focus();
      // Auto-trigger generate so it feels snappy
      generateAiContent();
    });
  });
}

function resetAiPanel() {
  currentAiContext = null;
  $("#aiTopic").value = "";
  hide($("#aiLoading"));
  hide($("#aiError"));
  hide($("#aiResults"));
}

async function generateAiContent() {
  if (!currentAiContext) return;
  const { item } = currentAiContext;
  const topic = $("#aiTopic").value.trim();

  if (!topic) {
    $("#aiTopic").focus();
    toast("Please enter a topic first", "default");
    return;
  }
  if (!item.notebook_book_id) {
    return;  // shouldn't happen — panel would have shown "unavailable" banner
  }

  // ── Browser-side cache check (instant for previously-asked topics) ──
  const localKey = `tutar:cache:${item.notebook_book_id}:${topic.toLowerCase()}`;
  try {
    const cachedRaw = localStorage.getItem(localKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.payload) {
        hide($("#aiInput"));
        hide($("#aiError"));
        hide($("#aiLoading"));
        renderAiResults({ ...cached.payload, _cached: true });
        saveRecentTopic(item.notebook_book_id, topic);
        return;
      }
    }
  } catch {}

  // Show loading, hide everything else
  hide($("#aiInput"));
  hide($("#aiError"));
  hide($("#aiResults"));
  show($("#aiLoading"));
  cycleLoadingText();

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/ai-generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        bookId: item.notebook_book_id,
        topic,
        className: `Class ${item.class}`,
        subject: item.subject,
      }),
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const j = await res.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    stopLoadingText();
    renderAiResults(data);

    // Save to browser cache for instant re-open
    try {
      localStorage.setItem(localKey, JSON.stringify({
        payload: data,
        cachedAt: Date.now(),
      }));
    } catch {}
    saveRecentTopic(item.notebook_book_id, topic);

  } catch (err) {
    stopLoadingText();
    hide($("#aiLoading"));
    show($("#aiError"));
    $("#aiErrorText").textContent = err.message || "Something went wrong while generating content.";
  }
}

// Track the last 5 generated topics per book (for the Recent Topics panel)
function saveRecentTopic(bookId, topic) {
  try {
    const key = `tutar:recent:${bookId}`;
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    // Remove if already there, prepend, cap at 5
    const filtered = list.filter((t) => t.toLowerCase() !== topic.toLowerCase());
    filtered.unshift(topic);
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
  } catch {}
}

function getRecentTopics(bookId) {
  try {
    return JSON.parse(localStorage.getItem(`tutar:recent:${bookId}`) || "[]");
  } catch { return []; }
}

// Cycle through friendly loading messages
let loadingTimer = null;
function cycleLoadingText() {
  const messages = [
    "Searching the textbook…",
    "Finding the right chapter…",
    "Composing the summary…",
    "Looking up videos…",
    "Generating practice questions…",
    "Almost done…",
  ];
  let i = 0;
  $("#aiLoadingText").textContent = messages[0];
  loadingTimer = setInterval(() => {
    i = (i + 1) % messages.length;
    $("#aiLoadingText").textContent = messages[i];
  }, 4000);
}
function stopLoadingText() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
}

function renderAiResults(data) {
  hide($("#aiLoading"));
  hide($("#aiInput"));
  hide($("#aiError"));
  show($("#aiResults"));

  // Notebook returns: content, lessonPlan, mcqs, models3D, images, videos, sources
  renderSection("#aiSummarySection", "#aiSummaryBody", data.content, renderMarkdownish);
  renderSection("#aiLessonPlanSection", "#aiLessonPlanBody", data.lessonPlan, renderMarkdownish);
  renderSection("#aiVideosSection", "#aiVideosBody", data.videos, renderVideos);
  renderSection("#aiImagesSection", "#aiImagesBody", data.images, renderImages);
  renderSection("#aiMcqsSection", "#aiMcqsBody", data.mcqs, renderMcqs);
  renderSection("#aiModelsSection", "#aiModelsBody", data.models3D, renderModels);
  renderSection("#aiSourcesSection", "#aiSourcesBody", data.sources, renderSources);

  // After everything is in the DOM, ask KaTeX to find and render any LaTeX math
  // expressions like $x^2$ (inline) or $$x = \frac{-b}{2a}$$ (display).
  renderMathInResults();

  // Scroll the AI PANEL only (not the whole page) up to its results section.
  // Using scrollIntoView() scrolls the body, which causes empty space below
  // the locked viewport.
  const panel = $("#aiPanel");
  if (panel) panel.scrollTop = 0;
}

// Run KaTeX over the entire results container.
// Safe to call multiple times — KaTeX skips already-rendered math.
function renderMathInResults() {
  if (typeof renderMathInElement !== "function") {
    // Library hasn't loaded yet (still streaming from CDN). Try again in a moment.
    setTimeout(renderMathInResults, 200);
    return;
  }
  try {
    renderMathInElement($("#aiResults"), {
      // Common delimiters Gemini uses:
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$",  right: "$",  display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      // Don't crash on bad LaTeX — just leave the text alone
      throwOnError: false,
      // Don't try to render math inside code/pre blocks
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      // Match common LaTeX commands Gemini outputs without escaping
      strict: false,
    });
  } catch (err) {
    console.warn("KaTeX render failed:", err);
  }
}

// Show/hide a section based on whether it has content
function renderSection(sectionSelector, bodySelector, value, renderer) {
  const hasContent = value && (typeof value === "string" ? value.trim() : value.length > 0);
  if (!hasContent) {
    hide($(sectionSelector));
    return;
  }
  show($(sectionSelector));
  $(bodySelector).innerHTML = "";
  renderer($(bodySelector), value);
}

// Lightweight markdown-ish renderer (paragraphs, bullets, bold) — no eval, safe
function renderMarkdownish(el, text) {
  const escape = (s) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Split into blocks separated by blank lines
  const blocks = escape(text).split(/\n\s*\n+/);

  const html = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";

    // Horizontal rule: --- or *** alone on a line
    if (/^[-*_]{3,}$/.test(trimmed)) {
      return '<hr class="ai-hr" />';
    }

    // Heading: # H1, ## H2, ### H3, #### H4
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && !trimmed.includes("\n")) {
      const level = Math.min(headingMatch[1].length, 6);
      return `<h${level} class="ai-h${level}">${inlineMd(headingMatch[2])}</h${level}>`;
    }

    // List: lines starting with * - or numbered
    const lines = trimmed.split("\n");
    const isList = lines.every((l) => /^\s*[*\-]\s+/.test(l) || /^\s*\d+\.\s+/.test(l));
    if (isList) {
      const ordered = /^\s*\d+\./.test(lines[0]);
      const items = lines.map((l) =>
        `<li>${inlineMd(l.replace(/^\s*[*\-]\s+/, "").replace(/^\s*\d+\.\s+/, ""))}</li>`
      ).join("");
      return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
    }

    // Mixed block — could be a paragraph with a heading inline at start
    // (e.g. "#### 1. Triangular Numbers\nTriangular numbers are...")
    // Process each line so headings inside a "block" still render
    let out = "";
    let inList = false;
    let listType = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Heading line?
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        if (inList) { out += listType === "ol" ? "</ol>" : "</ul>"; inList = false; }
        const lvl = Math.min(h[1].length, 6);
        out += `<h${lvl} class="ai-h${lvl}">${inlineMd(h[2])}</h${lvl}>`;
        continue;
      }

      // List item?
      const ul = line.match(/^[*\-]\s+(.+)$/);
      const ol = line.match(/^\d+\.\s+(.+)$/);
      if (ul || ol) {
        const wantType = ul ? "ul" : "ol";
        if (!inList) { out += `<${wantType}>`; inList = true; listType = wantType; }
        else if (listType !== wantType) {
          out += listType === "ol" ? "</ol>" : "</ul>";
          out += `<${wantType}>`;
          listType = wantType;
        }
        out += `<li>${inlineMd((ul || ol)[1])}</li>`;
        continue;
      }

      // Horizontal rule inside block?
      if (/^[-*_]{3,}$/.test(line)) {
        if (inList) { out += listType === "ol" ? "</ol>" : "</ul>"; inList = false; }
        out += '<hr class="ai-hr" />';
        continue;
      }

      // Plain prose line — close any open list, then start/continue paragraph
      if (inList) { out += listType === "ol" ? "</ol>" : "</ul>"; inList = false; }
      if (line) {
        out += `<p>${inlineMd(line)}</p>`;
      }
    }
    if (inList) out += listType === "ol" ? "</ol>" : "</ul>";
    return out;
  }).join("");

  el.innerHTML = html;
}

// Inline markdown — bold, italic. Math (`$...$`) is left as-is for KaTeX to handle later.
function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
}

function renderVideos(el, videos) {
  if (!Array.isArray(videos)) return;
  // YouTube-style card: red logo on the left, title + channel on the right
  const ytLogo = `
    <svg class="ai-card-yt-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF"/>
    </svg>`;
  el.innerHTML = videos.map((v) => `
    <a class="ai-card ai-video-card" href="${escapeAttr(v.url || v.link || "#")}" target="_blank" rel="noopener noreferrer">
      ${ytLogo}
      <div class="ai-card-content">
        <div class="ai-card-title">${escapeText(v.title || "Video")}</div>
        <div class="ai-card-meta">${escapeText(v.channel || v.source || "YouTube")}</div>
      </div>
    </a>
  `).join("");
}

function renderImages(el, images) {
  if (!Array.isArray(images)) return;
  el.innerHTML = images.map((img) => `
    <a class="ai-image-card" href="${escapeAttr(img.url || img.link || "#")}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttr(img.thumbnail || img.url || img.link)}"
           alt="${escapeAttr(img.title || "image")}"
           loading="lazy" />
    </a>
  `).join("");
}

function renderMcqs(el, mcqs) {
  if (!Array.isArray(mcqs) || mcqs.length === 0) {
    el.innerHTML = '<p style="color: var(--ink-faded); font-size: 13px;">No practice questions could be generated for this topic.</p>';
    return;
  }

  el.innerHTML = mcqs.map((q, qIdx) => {
    const correctIdx = typeof q.correctIndex === "number" ? q.correctIndex : -1;
    const opts = (q.options || []).map((opt, oi) => {
      const letter = String.fromCharCode(65 + oi);
      return `
        <button type="button"
                class="ai-mcq-option"
                data-q="${qIdx}"
                data-opt="${oi}"
                data-correct="${correctIdx}">
          <span class="ai-mcq-letter">${letter}.</span>
          <span class="ai-mcq-text">${escapeText(opt)}</span>
          <span class="ai-mcq-icon"></span>
        </button>`;
    }).join("");

    const explanation = q.explanation ? escapeText(q.explanation) : "";

    return `
      <div class="ai-mcq" data-q="${qIdx}">
        <p class="ai-mcq-question"><strong>Q${qIdx + 1}.</strong> ${escapeText(q.question || "")}</p>
        <div class="ai-mcq-options">${opts}</div>
        <div class="ai-mcq-feedback" id="ai-mcq-fb-${qIdx}" style="display:none">
          <div class="ai-mcq-fb-text"></div>
          ${explanation ? `<div class="ai-mcq-fb-explanation">${explanation}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  // Wire up click handlers for each option
  el.querySelectorAll(".ai-mcq-option").forEach((btn) => {
    btn.addEventListener("click", handleMcqClick);
  });
}

function handleMcqClick(e) {
  const btn = e.currentTarget;
  const qIdx = btn.dataset.q;
  const chosen = parseInt(btn.dataset.opt, 10);
  const correct = parseInt(btn.dataset.correct, 10);
  const isCorrect = chosen === correct;

  // Find all options for this question
  const mcq = btn.closest(".ai-mcq");
  const allOpts = mcq.querySelectorAll(".ai-mcq-option");

  // Already answered? Don't allow re-clicks.
  if (mcq.classList.contains("ai-mcq-answered")) return;
  mcq.classList.add("ai-mcq-answered");

  // Mark each option visually
  allOpts.forEach((b) => {
    const oi = parseInt(b.dataset.opt, 10);
    if (oi === correct) {
      b.classList.add("ai-mcq-correct");
    } else if (oi === chosen && !isCorrect) {
      b.classList.add("ai-mcq-wrong");
    } else {
      b.classList.add("ai-mcq-disabled");
    }
    b.disabled = true;
  });

  // Show feedback message
  const fb = document.getElementById(`ai-mcq-fb-${qIdx}`);
  if (fb) {
    const fbText = fb.querySelector(".ai-mcq-fb-text");
    if (fbText) {
      fbText.innerHTML = isCorrect
        ? `<span class="ai-mcq-fb-correct">✓ Correct!</span>`
        : `<span class="ai-mcq-fb-wrong">✗ Not quite.</span> The correct answer is <strong>${String.fromCharCode(65 + correct)}</strong>.`;
    }
    fb.style.display = "block";
  }
}

function renderModels(el, models) {
  if (!Array.isArray(models)) return;
  el.innerHTML = models.map((m) => `
    <a class="ai-card" href="${escapeAttr(m.url || m.link || "#")}" target="_blank" rel="noopener noreferrer">
      <div class="ai-card-title">${escapeText(m.title || m.name || "3D Model")}</div>
      <div class="ai-card-meta">${escapeText(m.source || "Sketchfab")}</div>
    </a>
  `).join("");
}

function renderSources(el, sources) {
  if (Array.isArray(sources)) {
    el.innerHTML = sources.map((s) => {
      // Notebook returns: { excerptNumber, relevance, preview }
      if (s && typeof s === "object") {
        const num = s.excerptNumber ?? "";
        const rel = typeof s.relevance === "number" ? `${s.relevance}% match` : "";
        const text = s.preview || s.text || s.chunk || "";
        return `
          <div class="ai-source">
            <div class="ai-source-head">
              <span class="ai-source-num">Excerpt ${num}</span>
              ${rel ? `<span class="ai-source-rel">${rel}</span>` : ""}
            </div>
            <p class="ai-source-text">${escapeText(text)}</p>
          </div>`;
      }
      return `<div class="ai-source"><p class="ai-source-text">${escapeText(String(s))}</p></div>`;
    }).join("");
  } else {
    renderMarkdownish(el, String(sources));
  }
}

function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Wire up buttons
$("#aiGenerateBtn")?.addEventListener("click", generateAiContent);
$("#aiRetryBtn")?.addEventListener("click", generateAiContent);
// Switches the AI panel from results view back to the topic-input form.
// Used by both the sticky back button (top of results) and the legacy
// "Generate another topic" button (bottom of results).
function showAiInputForm() {
  hide($("#aiResults"));
  hide($("#aiError"));
  hide($("#aiLoading"));
  show($("#aiInput"));
  const topicInput = $("#aiTopic");
  if (topicInput) {
    topicInput.value = "";
    topicInput.focus();
  }
}

$("#aiNewTopicBtn")?.addEventListener("click", showAiInputForm);
$("#aiBackBtn")?.addEventListener("click", showAiInputForm);

$("#aiTopic")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generateAiContent();
});

// AI panel toggle button (on PDF area) + close button (on panel header)
$("#aiToggleBtn")?.addEventListener("click", () => {
  toggleAiPanel();
  // When opening, focus the topic input for immediate typing
  if (aiPanelOpen) {
    setTimeout(() => $("#aiTopic")?.focus(), 250);
  }
});
$("#aiPanelCloseBtn")?.addEventListener("click", closeAiPanel);

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
