// ==============================================================================
// MR693 智慧圖書館 — 雙模架構前端引擎 (Local FastAPI + Cloud Serverless PWA)
// ==============================================================================

// 全域狀態
let isStaticMode = false;
let allArticles = [];        // 靜態模式下的全量文章緩存
let allCategories = [];      // 分類與計數清單
let statsData = {};          // 統計數據

let currentCategory = "ALL";
let searchQuery = "";
let currentSort = "auto";
let currentPage = 1;
const pageSize = 18;
let totalPages = 1;
let selectedArticleIds = new Set();

// DOM 元素
const totalCountEl = document.getElementById("totalCount");
const catCountEl = document.getElementById("catCount");
const catAllBadgeEl = document.getElementById("catAllBadge");
const categoryListEl = document.getElementById("categoryList");
const articleGridEl = document.getElementById("articleGrid");
const searchInputEl = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const sortSelectEl = document.getElementById("sortSelect");
const activeCatNameEl = document.getElementById("activeCatName");
const searchStatusTextEl = document.getElementById("searchStatusText");
const selectedCountEl = document.getElementById("selectedCount");
const drawerSelectedCountEl = document.getElementById("drawerSelectedCount");
const selectedPillsEl = document.getElementById("selectedPills");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicatorEl = document.getElementById("pageIndicator");
const selectAllBtn = document.getElementById("selectAllBtn");
const clearSelectBtn = document.getElementById("clearSelectBtn");
const rescanBtn = document.getElementById("rescanBtn");
const modeBadgeEl = document.getElementById("modeBadge");

// 移動端導航
const appSidebar = document.getElementById("appSidebar");
const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const pillarCivilLink = document.getElementById("pillarCivilLink");
const topChipCivil = document.getElementById("topChipCivil");

// 抽屜與 AI
const aiDrawerEl = document.getElementById("aiDrawer");
const toggleAiDrawerBtn = document.getElementById("toggleAiDrawerBtn");
const closeAiDrawerBtn = document.getElementById("closeAiDrawerBtn");
const apiKeyInputEl = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const questionInputEl = document.getElementById("questionInput");
const modelSelectEl = document.getElementById("modelSelect");
const sendQuestionBtn = document.getElementById("sendQuestionBtn");
const chatHistoryEl = document.getElementById("chatHistory");

// 模態框
const previewModalEl = document.getElementById("previewModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const mCatEl = document.getElementById("mCat");
const mTitleEl = document.getElementById("mTitle");
const mTakeawaysEl = document.getElementById("mTakeaways");
const mSummaryEl = document.getElementById("mSummary");
const mActionsEl = document.getElementById("mActions");
const mOriginalBtn = document.getElementById("mOriginalBtn");
const mVideoBtn = document.getElementById("mVideoBtn");

// ── 初始化 ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // 1. 載入儲存的 API Key
  const savedKey = localStorage.getItem("mr693_gemini_key") || "";
  if (savedKey) {
    apiKeyInputEl.value = savedKey;
  }

  // 2. 適配本地開發目錄 vs dist 發布目錄之民法連結
  if (window.location.pathname.includes("/knowledge_hub/static/")) {
    if (pillarCivilLink) pillarCivilLink.href = "../../01_projects/民法每日一篇_HTML/index.html";
    if (topChipCivil) topChipCivil.href = "../../01_projects/民法每日一篇_HTML/index.html";
  }

  // 3. 環境與運作模式偵測 (Dual-Mode Detection)
  await detectModeAndInit();

  // 4. 綁定所有事件
  setupEventListeners();
});

// ── 模式偵測與數據載入 ──────────────────────────────────────────────────
async function detectModeAndInit() {
  const isCloudDomain = window.location.hostname.includes("github.io") ||
                        window.location.hostname.includes("pages.dev") ||
                        window.location.hostname.includes("vercel.app") ||
                        window.location.protocol === "file:";

  if (isCloudDomain) {
    isStaticMode = true;
  } else {
    try {
      const ping = await fetch("/api/stats", { method: "GET" });
      isStaticMode = !ping.ok;
    } catch (e) {
      isStaticMode = true;
    }
  }

  updateModeUI();

  if (isStaticMode) {
    await loadStaticCatalog();
  } else {
    await loadServerStats();
    await loadServerCategories();
    await loadServerArticles();
  }
}

function updateModeUI() {
  if (modeBadgeEl) {
    if (isStaticMode) {
      modeBadgeEl.textContent = "⚡ 雲端極速版";
      modeBadgeEl.title = "運行於靜態 CDN，零伺服器延遲，手機離線秒開";
      modeBadgeEl.style.background = "#ecfdf5";
      modeBadgeEl.style.color = "#065f46";
      modeBadgeEl.style.borderColor = "#a7f3d0";
    } else {
      modeBadgeEl.textContent = "💻 本機工作站";
      modeBadgeEl.title = "連接本機 FastAPI 後端 [Port 8765]";
      modeBadgeEl.style.background = "#eff6ff";
      modeBadgeEl.style.color = "#1e40af";
      modeBadgeEl.style.borderColor = "#bfdbfe";
    }
  }

  if (rescanBtn && isStaticMode) {
    rescanBtn.title = "雲端靜態版由本機 build_online.py 編譯更新";
  }
}

// ── 靜態數據載入模式 (Serverless PWA) ──────────────────────────────────
async function loadStaticCatalog() {
  articleGridEl.innerHTML = `<div class="loading-state">載入雲端專欄庫中...</div>`;
  try {
    const res = await fetch("data/catalog.json");
    if (!res.ok) throw new Error("找不到 catalog.json");
    const data = await res.json();

    statsData = data.stats || {};
    allCategories = data.categories || [];
    allArticles = data.articles || [];

    totalCountEl.textContent = statsData.total_articles || allArticles.length;
    catCountEl.textContent = statsData.total_categories || allCategories.length;
    catAllBadgeEl.textContent = statsData.total_articles || allArticles.length;

    renderCategoryList(allCategories);
    renderStaticArticles();
  } catch (e) {
    console.error("載入靜態 catalog.json 失敗", e);
    articleGridEl.innerHTML = `<div class="loading-state">載入專欄索引失敗: ${e.message}<br><small>請確認已執行 build_online.py 生成 dist 資源</small></div>`;
  }
}

// ── 伺服器數據載入模式 (FastAPI) ───────────────────────────────────────
async function loadServerStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    totalCountEl.textContent = data.total_articles;
    catCountEl.textContent = data.total_categories;
    catAllBadgeEl.textContent = data.total_articles;
  } catch (e) {
    console.error("載入統計失敗", e);
  }
}

async function loadServerCategories() {
  try {
    const res = await fetch("/api/categories");
    allCategories = await res.json();
    renderCategoryList(allCategories);
  } catch (e) {
    console.error("載入分類失敗", e);
  }
}

async function loadServerArticles() {
  articleGridEl.innerHTML = `<div class="loading-state">載入專欄中...</div>`;
  const params = new URLSearchParams({
    page: currentPage,
    page_size: pageSize,
    sort_by: currentSort
  });
  if (currentCategory !== "ALL") params.append("category", currentCategory);
  if (searchQuery) params.append("q", searchQuery);

  updateSearchIndicator();

  try {
    const res = await fetch(`/api/articles?${params.toString()}`);
    const data = await res.json();
    totalPages = Math.ceil(data.total / data.page_size) || 1;
    pageIndicatorEl.textContent = `第 ${data.page} / ${totalPages} 頁 (共 ${data.total} 篇)`;
    prevPageBtn.disabled = data.page <= 1;
    nextPageBtn.disabled = data.page >= totalPages;

    if (!data.articles || data.articles.length === 0) {
      articleGridEl.innerHTML = `<div class="loading-state">沒有符合條件的專欄文章</div>`;
      return;
    }
    renderArticles(data.articles);
  } catch (e) {
    articleGridEl.innerHTML = `<div class="loading-state">載入失敗: ${e.message}</div>`;
  }
}

// ── 渲染分類清單 (共用) ────────────────────────────────────────────────
function renderCategoryList(categories) {
  const allItem = categoryListEl.querySelector('[data-cat="ALL"]');
  categoryListEl.innerHTML = "";
  if (allItem) categoryListEl.appendChild(allItem);

  categories.forEach(c => {
    const div = document.createElement("div");
    div.className = "cat-item" + (currentCategory === c.category ? " active" : "");
    div.dataset.cat = c.category;
    div.innerHTML = `
      <span class="cat-name" title="${escapeHtml(c.category)}">👤 ${escapeHtml(c.category)}</span>
      <span class="cat-badge">${c.count}</span>
    `;
    div.addEventListener("click", () => {
      document.querySelectorAll(".cat-item").forEach(el => el.classList.remove("active"));
      div.classList.add("active");
      currentCategory = c.category;
      activeCatNameEl.textContent = c.category;
      currentPage = 1;
      closeMobileSidebar();
      triggerLoadArticles();
    });
    categoryListEl.appendChild(div);
  });

  if (allItem) {
    allItem.onclick = () => {
      document.querySelectorAll(".cat-item").forEach(el => el.classList.remove("active"));
      allItem.classList.add("active");
      currentCategory = "ALL";
      activeCatNameEl.textContent = "全部專欄";
      currentPage = 1;
      closeMobileSidebar();
      triggerLoadArticles();
    };
  }
}

// ── 靜態記憶體極速檢索與排序 (MiniSearch Client-Side) ───────────────────
function renderStaticArticles() {
  updateSearchIndicator();

  // 1. 分類篩選
  let list = allArticles;
  if (currentCategory && currentCategory !== "ALL") {
    list = list.filter(a => a.category === currentCategory);
  }

  // 2. 關鍵字模糊全文檢索
  if (searchQuery) {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(t => t);
    list = list.filter(a => {
      const targetStr = (
        (a.title || "") + " " +
        (a.category || "") + " " +
        (a.key_takeaways || "") + " " +
        (a.summary || "") + " " +
        (a.action_items || "")
      ).toLowerCase();
      return tokens.every(token => targetStr.includes(token));
    });
  }

  // 3. 智能排序
  let sortMode = (currentSort || "auto").toLowerCase();
  if (sortMode === "auto") {
    const epKeywords = ["股癌", "podcast"];
    if (currentCategory && epKeywords.some(k => currentCategory.includes(k))) {
      sortMode = "ep_asc";
    } else {
      sortMode = "date_desc";
    }
  }

  list.sort((a, b) => {
    if (sortMode === "ep_asc" || sortMode === "ep_desc") {
      const getEp = (title) => {
        const m = (title || "").match(/EP(\d+)/i);
        return m ? parseInt(m[1], 10) : (sortMode === "ep_asc" ? 99999 : -1);
      };
      const epA = getEp(a.title);
      const epB = getEp(b.title);
      return sortMode === "ep_asc" ? epA - epB : epB - epA;
    } else if (sortMode === "date_asc") {
      return (a.mtime || 0) - (b.mtime || 0);
    } else if (sortMode === "title_asc") {
      return (a.title || "").localeCompare(b.title || "", "zh-Hant");
    } else if (sortMode === "title_desc") {
      return (b.title || "").localeCompare(a.title || "", "zh-Hant");
    } else {
      // date_desc (最新優先)
      return (b.mtime || 0) - (a.mtime || 0);
    }
  });

  // 4. 分頁計算
  const total = list.length;
  totalPages = Math.ceil(total / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  pageIndicatorEl.textContent = `第 ${currentPage} / ${totalPages} 頁 (共 ${total} 篇)`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;

  if (total === 0) {
    articleGridEl.innerHTML = `<div class="loading-state">沒有符合條件的專欄文章</div>`;
    return;
  }

  const offset = (currentPage - 1) * pageSize;
  const pageArticles = list.slice(offset, offset + pageSize);
  renderArticles(pageArticles);
}

function updateSearchIndicator() {
  if (searchQuery) {
    searchStatusTextEl.style.display = "inline-block";
    searchStatusTextEl.textContent = `搜尋關鍵字: "${searchQuery}"`;
  } else {
    searchStatusTextEl.style.display = "none";
  }
}

function triggerLoadArticles() {
  if (isStaticMode) {
    renderStaticArticles();
  } else {
    loadServerArticles();
  }
}

// ── 智能封面生成系統 ──────────────────────────────────────────────────
const CATEGORY_THEME = {
  '股癌':     { g: ['#1a1a2e','#16213e'], icon: '📈', label: '股市分析' },
  '瓦基':     { g: ['#0f3460','#533483'], icon: '📚', label: '閱讀投資' },
  '投資':     { g: ['#134e4a','#065f46'], icon: '💰', label: '投資理財' },
  '理財':     { g: ['#134e4a','#065f46'], icon: '💹', label: '理財規劃' },
  'CEO':      { g: ['#1e3a5f','#0e4b8c'], icon: '🏢', label: '商業思維' },
  'Diary':    { g: ['#2c1810','#8b3e2f'], icon: '🎙️', label: '名人訪談' },
  '商業':     { g: ['#1e293b','#334155'], icon: '🤝', label: '商業策略' },
  '思維':     { g: ['#2d1b69','#4c1d95'], icon: '🧠', label: '心智提升' },
  '心法':     { g: ['#1e1b4b','#312e81'], icon: '✨', label: '人生心法' },
  '哲學':     { g: ['#1c1917','#44403c'], icon: '🔮', label: '哲學思考' },
  '閱讀':     { g: ['#1c3557','#2e5984'], icon: '📖', label: '閱讀筆記' },
  'Podcast':  { g: ['#2e1065','#7c3aed'], icon: '🎧', label: 'Podcast 精華' },
  '讀本郝書': { g: ['#7c3aed','#4c1d95'], icon: '📕', label: '讀書筆記' },
  'AI':       { g: ['#042f2e','#115e59'], icon: '🤖', label: 'AI 趨勢' },
  '科技':     { g: ['#0c4a6e','#0369a1'], icon: '💻', label: '科技資訊' },
  '健康':     { g: ['#14532d','#166534'], icon: '🌿', label: '健康生活' },
  '運動':     { g: ['#422006','#7c2d12'], icon: '💪', label: '運動健身' },
  '_default': { g: ['#1e293b','#334155'], icon: '🎙️', label: '知識精華' },
};

function getCategoryTheme(category) {
  if (!category) return CATEGORY_THEME['_default'];
  for (const [key, theme] of Object.entries(CATEGORY_THEME)) {
    if (key !== '_default' && category.includes(key)) return theme;
  }
  const hue = (category.charCodeAt(0) * 37 + (category.charCodeAt(1 % category.length) || 0) * 13) % 360;
  return {
    g: [`hsl(${hue},60%,18%)`, `hsl(${(hue+30)%360},55%,28%)`],
    icon: '🎯',
    label: category.substring(0, 8)
  };
}

function generatePlaceholderThumb(title, category) {
  const theme = getCategoryTheme(category);
  const [c1, c2] = theme.g;
  const bigText = (title || '').replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '').substring(0, 2) || '✦';
  const shortTitle = (title || '').substring(0, 22) + ((title || '').length > 22 ? '…' : '');

  return `
    <div class="card-thumb-generated" style="background:linear-gradient(135deg, ${c1}, ${c2})">
      <div class="ctg-big-text">${bigText}</div>
      <div class="ctg-icon">${theme.icon}</div>
      <div class="ctg-title">${escapeHtml(shortTitle)}</div>
    </div>`;
}

// ── 渲染專欄卡片流 ────────────────────────────────────────────────────
function renderArticles(articles) {
  articleGridEl.innerHTML = "";

  articles.forEach(art => {
    const card = document.createElement("div");
    card.className = "article-card";
    const isChecked = selectedArticleIds.has(art.id);

    const thumbHtml = art.thumbnail_url 
      ? `<img src="${escapeHtml(art.thumbnail_url)}" alt="Thumbnail" class="card-thumb" data-title="${escapeHtml(art.title)}" data-cat="${escapeHtml(art.category)}" onerror="this.parentElement.innerHTML=generatePlaceholderThumb(this.dataset.title,this.dataset.cat)">`
      : generatePlaceholderThumb(art.title, art.category);

    const takeawayShort = art.key_takeaways ? art.key_takeaways : (art.action_items || "點擊查看詳情預覽精華摘要...");
    
    // 智慧連結：靜態模式直接讀取 rel_path，後端模式走 /view/{id}
    const viewHref = isStaticMode ? art.rel_path : `/view/${art.id}`;

    card.innerHTML = `
      <input type="checkbox" class="card-select-checkbox" data-id="${art.id}" data-title="${escapeHtml(art.title)}" ${isChecked ? "checked" : ""}>
      <div class="card-thumb-wrap">
        ${thumbHtml}
      </div>
      <div class="card-content">
        <div class="card-category">${escapeHtml(art.category)}</div>
        <h3 class="card-title" title="${escapeHtml(art.title)}">${escapeHtml(art.title)}</h3>
        <div class="card-takeaway-preview">
          ${escapeHtml(takeawayShort)}
        </div>
        <div class="card-footer">
          <button class="btn-detail" data-id="${art.id}">速覽精華</button>
          <a href="${viewHref}" target="_blank" class="link-original">原文閱讀 ↗</a>
        </div>
      </div>
    `;

    // 勾選框事件
    const checkbox = card.querySelector(".card-select-checkbox");
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedArticleIds.add(art.id);
      } else {
        selectedArticleIds.delete(art.id);
      }
      updateSelectedState();
    });

    // 速覽精華點擊事件
    card.querySelector(".btn-detail").addEventListener("click", () => {
      openPreviewModal(art.id);
    });

    articleGridEl.appendChild(card);
  });
}

function updateSelectedState() {
  const count = selectedArticleIds.size;
  selectedCountEl.textContent = count;
  drawerSelectedCountEl.textContent = count;

  selectedPillsEl.innerHTML = "";
  if (count === 0) {
    selectedPillsEl.innerHTML = `<span style="font-size:11px;color:#999;">尚未手動勾選（預設依問題自動檢索最相關 5 篇）</span>`;
    return;
  }

  selectedArticleIds.forEach(id => {
    const pill = document.createElement("span");
    pill.className = "pill-item";
    pill.textContent = `專欄 #${id}`;
    selectedPillsEl.appendChild(pill);
  });
}

// ── 開啟文章詳情模態框 ────────────────────────────────────────────────
async function openPreviewModal(articleId) {
  try {
    let art = null;
    if (isStaticMode) {
      art = allArticles.find(a => a.id === articleId);
      if (!art) throw new Error("找不到該篇專欄");
    } else {
      const res = await fetch(`/api/article/${articleId}`);
      if (!res.ok) throw new Error("讀取專欄失敗");
      art = await res.json();
    }

    mCatEl.textContent = art.category;
    mTitleEl.textContent = art.title;
    mOriginalBtn.href = isStaticMode ? art.rel_path : `/view/${art.id}`;
    
    if (art.video_link) {
      mVideoBtn.style.display = "inline-block";
      mVideoBtn.href = art.video_link;
    } else {
      mVideoBtn.style.display = "none";
    }

    mTakeawaysEl.textContent = art.key_takeaways || "無核心重點標籤";
    mSummaryEl.textContent = art.summary || "無詳細摘要";
    mActionsEl.textContent = art.action_items || "無關鍵行動清單";

    previewModalEl.style.display = "flex";
  } catch (e) {
    alert("讀取專欄失敗: " + e.message);
  }
}

// ── Gemini 智能問答引擎 (支援前端直連 Google API 與本地後端轉發) ────────
async function handleAskGemini() {
  const apiKey = apiKeyInputEl.value.trim();
  if (!apiKey) {
    alert("請先在抽屜內輸入並儲存你的 Google Gemini API Key！");
    aiDrawerEl.classList.remove("closed");
    apiKeyInputEl.focus();
    return;
  }

  const question = questionInputEl.value.trim();
  if (!question) {
    alert("請輸入你想詢問的問題");
    return;
  }

  appendMessage(question, "user");
  questionInputEl.value = "";
  sendQuestionBtn.disabled = true;
  sendQuestionBtn.textContent = "AI 思考中...";

  const selectedList = Array.from(selectedArticleIds);
  const model = modelSelectEl.value;

  try {
    if (isStaticMode) {
      // 雲端直連模式：直接在瀏覽器端組織 Prompt 並調用 Google 官方 REST API
      await askGeminiClientDirect(question, apiKey, model, selectedList);
    } else {
      // 本地後端模式：嘗試呼叫本地 FastAPI
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            question: question,
            model: model,
            article_ids: selectedList
          })
        });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.detail || "本地後端回應異常");
        } else {
          appendMessage(data.answer, "ai", data.sources);
        }
      } catch (err) {
        console.warn("本地端點失敗，降級至前端直連 Google API:", err);
        await askGeminiClientDirect(question, apiKey, model, selectedList);
      }
    }
  } catch (e) {
    appendMessage(`⚠️ 提問失敗: ${e.message}`, "ai");
  } finally {
    sendQuestionBtn.disabled = false;
    sendQuestionBtn.textContent = "發送問題 ✨";
  }
}

// 純客戶端直連 Google Gemini 官方 API
async function askGeminiClientDirect(question, apiKey, model, selectedIds) {
  let sources = [];
  let contextText = "";

  // 取得參考上下文文章
  if (selectedIds && selectedIds.length > 0) {
    const targetArticles = allArticles.filter(a => selectedIds.includes(a.id));
    targetArticles.forEach(r => {
      sources.push({ id: r.id, title: r.title, category: r.category });
      contextText += `\n\n【專欄來源：${r.category} - ${r.title}】\n`;
      if (r.key_takeaways) contextText += `核心重點：\n${r.key_takeaways}\n`;
      if (r.summary) contextText += `摘要：\n${r.summary}\n`;
      if (r.action_items) contextText += `行動建議：\n${r.action_items}\n`;
    });
  } else {
    // 依關鍵字自動選取前 5 篇最相關的專欄
    const tokens = question.trim().toLowerCase().split(/\s+/).filter(t => t);
    let matched = [];
    if (tokens.length > 0) {
      matched = allArticles.filter(a => {
        const str = ((a.title || "") + " " + (a.key_takeaways || "") + " " + (a.summary || "")).toLowerCase();
        return tokens.some(t => str.includes(t));
      }).slice(0, 5);
    }
    if (matched.length === 0) {
      matched = allArticles.slice(0, 5);
    }
    matched.forEach(r => {
      sources.push({ id: r.id, title: r.title, category: r.category });
      contextText += `\n\n【專欄來源：${r.category} - ${r.title}】\n`;
      if (r.key_takeaways) contextText += `核心重點：\n${r.key_takeaways}\n`;
      if (r.summary) contextText += `摘要：\n${r.summary}\n`;
    });
  }

  const prompt = `你是一位博學的專欄知識庫專家。請依據以下提供的【名人專欄資料庫內容】，精準回答使用者的問題。
回答時請邏輯條理清晰，綜合各名人觀點，並具體指出觀點出自哪一位名人或專欄。

【參考專欄內容】：
${contextText}

【使用者提問】：
${question}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google API 回應狀態碼 ${response.status}: ${errorBody}`);
  }

  const resJson = await response.json();
  const answer = resJson.candidates[0].content.parts[0].text;
  appendMessage(answer, "ai", sources);
}

function appendMessage(text, role, sources = []) {
  const msg = document.createElement("div");
  msg.className = `chat-msg msg-${role}`;
  
  let formatted = escapeHtml(text).replace(/\n/g, "<br>");
  msg.innerHTML = formatted;

  if (sources && sources.length > 0 && role === "ai") {
    const sourceBox = document.createElement("div");
    sourceBox.style.marginTop = "10px";
    sourceBox.style.paddingTop = "8px";
    sourceBox.style.borderTop = "1px dashed #e2e8f0";
    sourceBox.style.fontSize = "11.5px";
    sourceBox.style.color = "#64748b";
    sourceBox.innerHTML = "<strong>📚 參考專欄來源：</strong><br>";
    sources.forEach(s => {
      sourceBox.innerHTML += `<span class="source-tag" title="${escapeHtml(s.title)}">📍 ${escapeHtml(s.category)}: ${escapeHtml(s.title.substring(0, 25))}...</span>`;
    });
    msg.appendChild(sourceBox);
  }

  chatHistoryEl.appendChild(msg);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

// ── 行動端選單輔助控制 ────────────────────────────────────────────────
function openMobileSidebar() {
  if (appSidebar) appSidebar.classList.add("open");
  if (sidebarBackdrop) sidebarBackdrop.classList.add("active");
}

function closeMobileSidebar() {
  if (appSidebar) appSidebar.classList.remove("open");
  if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
}

// ── 事件綁定集中處理 ──────────────────────────────────────────────────
function setupEventListeners() {
  // 移動端漢堡選單切換
  if (mobileSidebarToggle) mobileSidebarToggle.addEventListener("click", openMobileSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeMobileSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeMobileSidebar);

  // 搜尋關鍵字
  let debounceTimer;
  searchInputEl.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    searchQuery = e.target.value.trim();
    clearSearchBtn.style.display = searchQuery ? "block" : "none";
    debounceTimer = setTimeout(() => {
      currentPage = 1;
      triggerLoadArticles();
    }, 250);
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInputEl.value = "";
    searchQuery = "";
    clearSearchBtn.style.display = "none";
    currentPage = 1;
    triggerLoadArticles();
  });

  // 排序下拉選單
  if (sortSelectEl) {
    sortSelectEl.addEventListener("change", (e) => {
      currentSort = e.target.value;
      currentPage = 1;
      triggerLoadArticles();
    });
  }

  // 分頁按鈕
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      triggerLoadArticles();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      triggerLoadArticles();
    }
  });

  // 全選 / 清除
  selectAllBtn.addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".card-select-checkbox");
    checkboxes.forEach(cb => {
      cb.checked = true;
      selectedArticleIds.add(parseInt(cb.dataset.id));
    });
    updateSelectedState();
  });

  clearSelectBtn.addEventListener("click", () => {
    selectedArticleIds.clear();
    const checkboxes = document.querySelectorAll(".card-select-checkbox");
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectedState();
  });

  // 重新整理索引按鈕
  rescanBtn.addEventListener("click", async () => {
    if (isStaticMode) {
      alert("💡 目前為【雲端線上版】：\n專欄索引由本機「build_online.py」自動生成。\n若您在本機加入了新專欄，請於本機執行「一鍵發布線上版.bat」即可秒級同步至雲端！");
      return;
    }
    rescanBtn.disabled = true;
    rescanBtn.textContent = "⏳ 掃描中...";
    try {
      const res = await fetch("/api/rescan", { method: "POST" });
      if (res.ok) {
        await loadServerStats();
        await loadServerCategories();
        await loadServerArticles();
        alert("專欄重新索引完成！");
      }
    } catch (e) {
      alert("重新掃描失敗: " + e.message);
    } finally {
      rescanBtn.disabled = false;
      rescanBtn.textContent = "🔄 重新整理索引";
    }
  });

  // Gemini 抽屜切換
  toggleAiDrawerBtn.addEventListener("click", () => {
    aiDrawerEl.classList.toggle("closed");
  });
  closeAiDrawerBtn.addEventListener("click", () => {
    aiDrawerEl.classList.add("closed");
  });

  // 儲存 API Key
  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInputEl.value.trim();
    if (!key) {
      alert("請輸入有效的 Gemini API Key");
      return;
    }
    localStorage.setItem("mr693_gemini_key", key);
    alert("API Key 已成功保存在本機瀏覽器 LocalStorage！");
  });

  // 發送 Gemini 問題
  sendQuestionBtn.addEventListener("click", handleAskGemini);
  questionInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleAskGemini();
    }
  });

  // 模態框關閉
  closeModalBtn.addEventListener("click", () => {
    previewModalEl.style.display = "none";
  });
  previewModalEl.addEventListener("click", (e) => {
    if (e.target === previewModalEl) {
      previewModalEl.style.display = "none";
    }
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
