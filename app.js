(() => {
  "use strict";

  const DB_NAME = "local-portfolio-v1";
  const DB_VERSION = 1;
  const STORE_NAME = "site-state";
  const STATE_KEY = "current";
  const FALLBACK_KEY = "local-portfolio-fallback-v1";
  const LAYOUT_KEY = "local-portfolio-layout-warm-v1";
  const THEME_KEY = "local-portfolio-theme";
  const LAYOUT_NAMES = {
    studio: "侧栏编辑室",
    gallery: "作品画廊",
    index: "索引档案"
  };
  const TYPE_LABELS = {
    app: "互动作品",
    mixed: "图文作品",
    image: "图片作品",
    text: "文字作品",
    link: "网址作品"
  };
  const embeddedImages = globalThis.PORTFOLIO_IMAGES || {};

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    body: document.body,
    sidebar: $("#sidebar"),
    sidebarScrim: $("#sidebarScrim"),
    openSidebarButton: $("#openSidebarButton"),
    closeSidebarButton: $("#closeSidebarButton"),
    profileAvatar: $("#profileAvatar"),
    profileMonogram: $("#profileMonogram"),
    sidebarSiteName: $("#sidebarSiteName"),
    sidebarTagline: $("#sidebarTagline"),
    moduleNav: $("#moduleNav"),
    themeButton: $("#themeButton"),
    themeButtonText: $("#themeButtonText"),
    layoutButton: $("#layoutButton"),
    searchInput: $("#searchInput"),
    clearSearchButton: $("#clearSearchButton"),
    addWorkButton: $("#addWorkButton"),
    settingsButton: $("#settingsButton"),
    breadcrumbCurrent: $("#breadcrumbCurrent"),
    heroOwnerName: $("#heroOwnerName"),
    heroIntro: $("#heroIntro"),
    heroIndex: $("#heroIndex"),
    moduleCount: $("#moduleCount"),
    workCount: $("#workCount"),
    exploreButton: $("#exploreButton"),
    resultsCopy: $("#resultsCopy"),
    workspace: $("#workspace"),
    emptyState: $("#emptyState"),
    emptyTitle: $("#emptyTitle"),
    emptyCopy: $("#emptyCopy"),
    emptyActionButton: $("#emptyActionButton"),
    recentList: $("#recentList"),
    tagCloud: $("#tagCloud"),
    aboutCopy: $("#aboutCopy"),
    editProfileButton: $("#editProfileButton"),
    footerSiteName: $("#footerSiteName"),
    footerYear: $("#footerYear"),
    workEditorDialog: $("#workEditorDialog"),
    workEditorTitle: $("#workEditorTitle"),
    workForm: $("#workForm"),
    closeWorkEditorButton: $("#closeWorkEditorButton"),
    cancelWorkEditorButton: $("#cancelWorkEditorButton"),
    fieldModuleTitle: $("#fieldModuleTitle"),
    moduleSuggestions: $("#moduleSuggestions"),
    fieldWorkTitle: $("#fieldWorkTitle"),
    fieldWorkType: $("#fieldWorkType"),
    fieldWorkDate: $("#fieldWorkDate"),
    fieldWorkStatus: $("#fieldWorkStatus"),
    fieldSummary: $("#fieldSummary"),
    fieldBody: $("#fieldBody"),
    fieldLinks: $("#fieldLinks"),
    fieldTags: $("#fieldTags"),
    fieldFeatured: $("#fieldFeatured"),
    fieldImages: $("#fieldImages"),
    imageUploadZone: $("#imageUploadZone"),
    imageEditorList: $("#imageEditorList"),
    workFormError: $("#workFormError"),
    workDetailDialog: $("#workDetailDialog"),
    detailContent: $("#detailContent"),
    closeDetailButton: $("#closeDetailButton"),
    editCurrentWorkButton: $("#editCurrentWorkButton"),
    interactiveDialog: $("#interactiveDialog"),
    interactiveDialogTitle: $("#interactiveDialogTitle"),
    interactiveFrame: $("#interactiveFrame"),
    interactiveBackButton: $("#interactiveBackButton"),
    closeInteractiveButton: $("#closeInteractiveButton"),
    settingsDialog: $("#settingsDialog"),
    settingsForm: $("#settingsForm"),
    closeSettingsButton: $("#closeSettingsButton"),
    cancelSettingsButton: $("#cancelSettingsButton"),
    settingsAvatarPreview: $("#settingsAvatarPreview"),
    settingsAvatarFallback: $("#settingsAvatarFallback"),
    fieldAvatar: $("#fieldAvatar"),
    removeAvatarButton: $("#removeAvatarButton"),
    fieldSiteName: $("#fieldSiteName"),
    fieldOwnerName: $("#fieldOwnerName"),
    fieldTagline: $("#fieldTagline"),
    fieldIntro: $("#fieldIntro"),
    fieldAbout: $("#fieldAbout"),
    moduleManager: $("#moduleManager"),
    exportBackupButton: $("#exportBackupButton"),
    importBackupTrigger: $("#importBackupTrigger"),
    importBackupInput: $("#importBackupInput"),
    resetDemoButton: $("#resetDemoButton"),
    settingsFormError: $("#settingsFormError"),
    layoutDialog: $("#layoutDialog"),
    closeLayoutDialogButton: $("#closeLayoutDialogButton"),
    currentLayoutName: $("#currentLayoutName"),
    layoutDoneButton: $("#layoutDoneButton"),
    toast: $("#toast")
  };

  let state = null;
  let dbPromise = null;
  let saveQueue = Promise.resolve();
  let toastTimer = null;
  let editingWorkId = null;
  let currentDetailId = null;
  let draftCover = "";
  let draftImages = [];
  let pendingAvatar = "";
  let searchQuery = "";
  let currentLayout = localStorage.getItem(LAYOUT_KEY) || "index";
  let currentTheme = localStorage.getItem(THEME_KEY) || "dark";

  function makeId(prefix) {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanText(value, maxLength = 5000) {
    return String(value ?? "").trim().slice(0, maxLength);
  }

  function normalizeForSearch(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  }

  function today() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "未填写日期";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value);
  }

  function formatShortDate(value) {
    if (!value) return "刚刚";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return formatDate(value);
    return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  }

  function normalizeTags(input) {
    const source = Array.isArray(input) ? input : String(input ?? "").split(/[,，]/);
    return [...new Set(source.map((tag) => cleanText(tag, 32)).filter(Boolean))].slice(0, 20);
  }

  function parseLinks(input) {
    if (Array.isArray(input)) {
      return input
        .map((link) => ({
          label: cleanText(link?.label, 80),
          url: normalizeUrl(link?.url)
        }))
        .filter((link) => link.url)
        .slice(0, 12);
    }

    return String(input ?? "")
      .split(/\r?\n/)
      .map((line) => {
        const text = line.trim();
        if (!text) return null;
        const separator = text.indexOf("|");
        let label = separator >= 0 ? text.slice(0, separator).trim() : "";
        const candidate = separator >= 0 ? text.slice(separator + 1).trim() : text;
        const url = normalizeUrl(candidate);
        if (!url) return null;
        if (!label) label = linkDomain(url);
        return { label, url };
      })
      .filter(Boolean)
      .slice(0, 12);
  }

  function normalizeUrl(value) {
    const text = cleanText(value, 2000);
    if (!text) return "";
    try {
      const url = new URL(text);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function linkDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || "打开链接";
    } catch {
      return "打开链接";
    }
  }

  function safeImageSource(value) {
    const source = String(value ?? "");
    return source.startsWith("data:image/") ||
      /^https?:\/\//.test(source) ||
      /^(?:\.\/)?assets\/(?:[\w.-]+\/)*[\w.-]+\.(?:jpe?g|png|webp|gif)$/i.test(source)
      ? source
      : "";
  }

  function safeInteractiveUrl(value) {
    const source = cleanText(value, 500);
    if (!source || source.includes("..") || source.startsWith("/") || source.includes("://")) {
      return "";
    }
    return /^works\/[\w./-]+(?:\?[\w=&.-]*)?$/.test(source) ? source : "";
  }

  function makeGeneratedCover(label, variant = 0) {
    const palettes = [
      ["#2a1a11", "#d7a15f", "#3b271a", "#f5e6d3"],
      ["#342218", "#e0bd83", "#493325", "#faedd9"],
      ["#2e1d18", "#d89569", "#422b22", "#f4e0d2"],
      ["#26170f", "#df8d55", "#3b2419", "#f7dfc8"]
    ];
    const [bg, stroke, panel, text] = palettes[variant % palettes.length];
    const initial = escapeHtml(label.slice(0, 1));
    const safeLabel = escapeHtml(label.slice(0, 18));
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
        <defs>
          <radialGradient id="g" cx="75%" cy="20%" r="85%">
            <stop offset="0" stop-color="${stroke}" stop-opacity=".22"/>
            <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
          </radialGradient>
          <pattern id="grid" width="58" height="58" patternUnits="userSpaceOnUse">
            <path d="M58 0H0V58" fill="none" stroke="${text}" stroke-opacity=".08" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="1200" height="800" fill="${bg}"/>
        <rect width="1200" height="800" fill="url(#grid)"/>
        <rect width="1200" height="800" fill="url(#g)"/>
        <circle cx="${260 + variant * 95}" cy="${470 - variant * 32}" r="${170 + variant * 12}" fill="none" stroke="${stroke}" stroke-opacity=".42" stroke-width="1.4"/>
        <circle cx="${260 + variant * 95}" cy="${470 - variant * 32}" r="${104 + variant * 12}" fill="none" stroke="${stroke}" stroke-opacity=".72" stroke-width="1.4"/>
        <path d="M${-80 + variant * 20} ${620 - variant * 40} C${280 + variant * 30} ${210 + variant * 20}, ${620 - variant * 50} ${720 - variant * 70}, ${1280 + variant * 12} ${210 + variant * 48}" fill="none" stroke="${stroke}" stroke-opacity=".48" stroke-width="2"/>
        <path d="M${-80 + variant * 20} ${680 - variant * 40} C${320 + variant * 30} ${320 + variant * 20}, ${710 - variant * 50} ${810 - variant * 70}, ${1280 + variant * 12} ${310 + variant * 48}" fill="none" stroke="${stroke}" stroke-opacity=".2" stroke-width="1"/>
        <rect x="${805 - variant * 20}" y="110" width="255" height="255" rx="127" fill="${panel}" stroke="${text}" stroke-opacity=".12"/>
        <text x="${933 - variant * 20}" y="273" fill="${text}" font-family="Georgia,serif" font-size="118" text-anchor="middle" opacity=".9">${initial}</text>
        <text x="58" y="728" fill="${text}" font-family="monospace" font-size="20" letter-spacing="5" opacity=".5">${safeLabel}</text>
        <text x="1108" y="728" fill="${text}" font-family="monospace" font-size="15" letter-spacing="3" text-anchor="end" opacity=".38">PERSONAL / ARCHIVE</text>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createAiAgentWork(moduleId = "module-ai") {
    return {
      id: "work-ai-agent",
      moduleId,
      title: "我和我的AI——AI agent使用情况",
      type: "app",
      summary: "一份关于我如何使用 AI agent 的真实记录：每个工具做了什么、卡在了哪里，以及最后真正完成了什么。",
      body: "这件作品把我和 AI agent 的协作过程整理成了一份可搜索、可浏览的档案。\n\n我没有只记录工具名称，而是把每条经历拆成“使用工具做了什么”和“取得了什么成效”：workbody 参与内容组织与表达，codex 帮助把想法落实为代码，DeepSeekharness 用于论文与知识检索。\n\n点击“进入互动作品”可以继续浏览工具记录、搜索用途，并在小屋内部查看完整页面。",
      tags: ["AI Agent", "工具使用", "成果记录", "个人网站"],
      date: "2026-11-18",
      links: [],
      cover: embeddedImages.aiAgentCover || "assets/covers/ai-agent-warm.png",
      images: [],
      interactiveUrl: "works/ai-agent/index.html?embed=1",
      status: "published",
      featured: true,
      order: 0,
      createdAt: "2026-11-18T09:00:00.000Z",
      updatedAt: "2026-11-18T09:00:00.000Z"
    };
  }

  function createMlpWork(moduleId = "module-ai") {
    return {
      id: "work-mlp-neural-flight",
      moduleId,
      title: "MLP学习参数的实现和可视化",
      type: "app",
      summary: "用一趟可交互的神经航班，逐步看见输入、权重、偏置、ReLU、Logit 与 Sigmoid 如何完成一次 MLP 前向传播。",
      body: "这件作品把多层感知机从“黑箱”放回可以观察和手动验算的尺度。\n\n页面以 2 → 3 → 1 的网络结构为例，用七站航线逐步展示一次前向传播：两个输入特征如何乘权重、加偏置，经过 ReLU 后汇总到输出层，最后由 Sigmoid 转换为概率。\n\n你可以点击“下一站”逐项核对公式，也可以开启自动巡航。页面同时展示隐藏层参数表和最终输出，让每一步变化都能与实际数值对应。",
      tags: ["MLP", "神经网络", "前向传播", "参数可视化"],
      date: "2026-11-18",
      links: [],
      cover: embeddedImages.mlpCover || "assets/covers/mlp-neural-flight.png",
      images: [],
      interactiveUrl: "works/mlp-neural-flight/index.html?embed=1",
      status: "published",
      featured: false,
      order: 1,
      createdAt: "2026-11-15T06:31:00.000Z",
      updatedAt: "2026-11-18T11:20:00.000Z"
    };
  }

  function createDefaultState() {
    return {
      version: 1,
      brandVersion: 1,
      contentVersion: 4,
      profile: {
        siteName: "卢朝鑫的作品小屋",
        ownerName: "卢朝鑫",
        tagline: "把做过的事，留在这里。",
        intro: "这里收集我做过的项目、写下的文字，以及值得回看的片刻。每一件作品都可以由我随时更新。",
        about: "这里是卢朝鑫的个人作品小屋。我把做过的项目、写过的文字和值得回看的片刻收在这里；所有作品都可以随时更新，也可以完整导出备份。",
        avatar: embeddedImages.avatar || "assets/avatar-lu-chaoxin.jpg"
      },
      modules: [
        { id: "module-ai", title: "AI 实验", subtitle: "AI Agent 与 MLP 互动实验", order: 0 }
      ],
      works: [createAiAgentWork(), createMlpWork()]
    };
  }

  function normalizeState(input) {
    if (!input || typeof input !== "object") {
      throw new Error("备份内容不是有效的站点数据。");
    }
    if (!Array.isArray(input.modules) || !Array.isArray(input.works)) {
      throw new Error("备份缺少 modules 或 works 数组。");
    }

    const profileSource = input.profile && typeof input.profile === "object" ? input.profile : {};
    const usedModuleIds = new Set();
    const modules = input.modules
      .map((module, index) => {
        if (!module || typeof module !== "object") return null;
        let id = cleanText(module.id, 120).replace(/[^\w-]/g, "-") || makeId("module");
        while (usedModuleIds.has(id)) id = makeId("module");
        usedModuleIds.add(id);
        const title = cleanText(module.title, 48);
        if (!title) return null;
        return {
          id,
          title,
          subtitle: cleanText(module.subtitle, 100),
          order: Number.isFinite(Number(module.order)) ? Number(module.order) : index
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order)
      .map((module, index) => ({ ...module, order: index }));

    if (!modules.length) {
      modules.push({ id: "module-uncategorized", title: "未分类", subtitle: "", order: 0 });
    }

    const fallbackModuleId = modules[0].id;
    const usedWorkIds = new Set();
    const works = input.works
      .map((work, index) => {
        if (!work || typeof work !== "object") return null;
        let id = cleanText(work.id, 120).replace(/[^\w-]/g, "-") || makeId("work");
        while (usedWorkIds.has(id)) id = makeId("work");
        usedWorkIds.add(id);
        const title = cleanText(work.title, 100);
        if (!title) return null;
        const moduleId = modules.some((module) => module.id === work.moduleId)
          ? work.moduleId
          : fallbackModuleId;
        const images = (Array.isArray(work.images) ? work.images : [])
          .map(safeImageSource)
          .filter(Boolean)
          .slice(0, 24);
        const cover = safeImageSource(work.cover) || images[0] || "";
        return {
          id,
          moduleId,
          title,
          type: Object.hasOwn(TYPE_LABELS, work.type) ? work.type : "mixed",
          summary: cleanText(work.summary, 320),
          body: cleanText(work.body, 30_000),
          tags: normalizeTags(work.tags),
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(work.date)) ? String(work.date) : today(),
          links: parseLinks(work.links),
          interactiveUrl: safeInteractiveUrl(work.interactiveUrl),
          cover,
          images: images.filter((image) => image !== cover),
          status: work.status === "draft" ? "draft" : "published",
          featured: Boolean(work.featured),
          order: Number.isFinite(Number(work.order)) ? Number(work.order) : index,
          createdAt: cleanText(work.createdAt, 60) || new Date().toISOString(),
          updatedAt: cleanText(work.updatedAt, 60) || new Date().toISOString()
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order)
      .map((work, index) => ({ ...work, order: index }));

    return {
      version: 1,
      brandVersion: Number(input.brandVersion) || 0,
      contentVersion: Number(input.contentVersion) || 0,
      profile: {
        siteName: cleanText(profileSource.siteName, 48) || "卢朝鑫的作品小屋",
        ownerName: cleanText(profileSource.ownerName, 32) || "卢朝鑫",
        tagline: cleanText(profileSource.tagline, 90) || "把做过的事，留在这里。",
        intro: cleanText(profileSource.intro, 600),
        about: cleanText(profileSource.about, 1200),
        avatar: safeImageSource(profileSource.avatar)
      },
      modules,
      works
    };
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("当前浏览器不支持 IndexedDB。"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    return dbPromise;
  }

  async function finalizeLoadedState(rawState) {
    const loaded = normalizeState(rawState);
    let changed = false;
    if (loaded.brandVersion < 1) {
      loaded.profile.siteName = "卢朝鑫的作品小屋";
      loaded.profile.ownerName = "卢朝鑫";
      loaded.profile.avatar = embeddedImages.avatar || "assets/avatar-lu-chaoxin.jpg";
      loaded.profile.about = loaded.profile.about ||
        "这里是卢朝鑫的个人作品小屋。我把做过的项目、写过的文字和值得回看的片刻收在这里。";
      loaded.brandVersion = 1;
      changed = true;
    }
    if (loaded.contentVersion < 1) {
      const sampleWorkIds = new Set([
        "work-xor",
        "work-tools",
        "work-interface",
        "work-light"
      ]);
      loaded.works = loaded.works.filter((work) => !sampleWorkIds.has(work.id));

      let aiModule = loaded.modules.find((module) =>
        module.id === "module-ai" || normalizeForSearch(module.title) === "ai 实验"
      );
      if (!aiModule) {
        aiModule = {
          id: "module-ai",
          title: "AI 实验",
          subtitle: "AI Agent 使用与成果记录",
          order: 0
        };
        loaded.modules.push(aiModule);
      }

      const titleKey = normalizeForSearch("我和我的AI——AI agent使用情况");
      let aiWork = loaded.works.find((work) => normalizeForSearch(work.title) === titleKey);
      if (aiWork) {
        aiWork.moduleId = aiModule.id;
        aiWork.type = "app";
        aiWork.cover = aiWork.cover || "assets/covers/ai-agent-warm.png";
        aiWork.interactiveUrl = "works/ai-agent/index.html?embed=1";
        aiWork.featured = true;
      } else {
        aiWork = createAiAgentWork(aiModule.id);
        loaded.works.push(aiWork);
      }

      loaded.modules = loaded.modules.filter((module) =>
        module.id === aiModule.id || loaded.works.some((work) => work.moduleId === module.id)
      );
      loaded.modules = [
        aiModule,
        ...loaded.modules
          .filter((module) => module.id !== aiModule.id)
          .sort((a, b) => a.order - b.order)
      ].map((module, index) => ({ ...module, order: index }));

      const aiWorks = [
        aiWork,
        ...loaded.works
          .filter((work) => work.moduleId === aiModule.id && work.id !== aiWork.id)
          .sort((a, b) => a.order - b.order)
      ];
      aiWorks.forEach((work, index) => {
        work.order = index;
      });
      loaded.contentVersion = 1;
      changed = true;
    }
    if (loaded.contentVersion < 2) {
      const aiWork = loaded.works.find((work) =>
        normalizeForSearch(work.title) === normalizeForSearch("我和我的AI——AI agent使用情况")
      );
      if (aiWork) {
        aiWork.cover = embeddedImages.aiAgentCover || "assets/covers/ai-agent-warm.png";
        aiWork.interactiveUrl = "works/ai-agent/index.html?embed=1";
        aiWork.type = "app";
      }
      loaded.contentVersion = 2;
      changed = true;
    }
    if (loaded.contentVersion < 3) {
      let aiModule = loaded.modules.find((module) =>
        module.id === "module-ai" || normalizeForSearch(module.title) === "ai 实验"
      );
      if (!aiModule) {
        aiModule = {
          id: "module-ai",
          title: "AI 实验",
          subtitle: "AI Agent 与 MLP 互动实验",
          order: 0
        };
        loaded.modules.push(aiModule);
      } else if (!aiModule.subtitle || aiModule.subtitle === "AI Agent 使用与成果记录") {
        aiModule.subtitle = "AI Agent 与 MLP 互动实验";
      }

      const titleKey = normalizeForSearch("MLP学习参数的实现和可视化");
      let mlpWork = loaded.works.find((work) => normalizeForSearch(work.title) === titleKey);
      if (mlpWork) {
        mlpWork.moduleId = aiModule.id;
        mlpWork.type = "app";
        mlpWork.cover = "assets/covers/mlp-neural-flight.png";
        mlpWork.interactiveUrl = "works/mlp-neural-flight/index.html?embed=1";
      } else {
        mlpWork = createMlpWork(aiModule.id);
        loaded.works.push(mlpWork);
      }

      const aiAgentWork = loaded.works.find((work) =>
        normalizeForSearch(work.title) === normalizeForSearch("我和我的AI——AI agent使用情况")
      );
      if (aiAgentWork) aiAgentWork.order = 0;
      mlpWork.order = 1;
      loaded.contentVersion = 3;
      changed = true;
    }
    if (loaded.contentVersion < 4) {
      const aiWork = loaded.works.find((work) =>
        normalizeForSearch(work.title) === normalizeForSearch("我和我的AI——AI agent使用情况")
      );
      const mlpWork = loaded.works.find((work) =>
        normalizeForSearch(work.title) === normalizeForSearch("MLP学习参数的实现和可视化")
      );
      if (aiWork && embeddedImages.aiAgentCover) aiWork.cover = embeddedImages.aiAgentCover;
      if (mlpWork && embeddedImages.mlpCover) mlpWork.cover = embeddedImages.mlpCover;
      if (embeddedImages.avatar) loaded.profile.avatar = embeddedImages.avatar;
      loaded.contentVersion = 4;
      changed = true;
    }
    if (changed) await writeState(loaded);
    return loaded;
  }

  async function loadState() {
    try {
      const db = await openDatabase();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      });
      if (value) return finalizeLoadedState(value);
    } catch (error) {
      console.warn("IndexedDB unavailable, trying fallback storage:", error);
    }

    const fallback = localStorage.getItem(FALLBACK_KEY);
    if (fallback) {
      try {
        return finalizeLoadedState(JSON.parse(fallback));
      } catch (error) {
        console.warn("Fallback state could not be read:", error);
      }
    }
    return createDefaultState();
  }

  async function writeState(value) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value, STATE_KEY);
        transaction.addEventListener("complete", resolve);
        transaction.addEventListener("error", () => reject(transaction.error));
        transaction.addEventListener("abort", () => reject(transaction.error));
      });
    } catch (error) {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
      console.warn("Saved using fallback localStorage:", error);
    }
  }

  function persistState(message = "") {
    const snapshot = clone(state);
    saveQueue = saveQueue.then(() => writeState(snapshot));
    return saveQueue
      .then(() => {
        if (message) showToast(message);
      })
      .catch((error) => {
        console.error("Could not save portfolio state:", error);
        showToast("保存失败，请先导出备份，并检查浏览器存储空间。", "error");
      });
  }

  function showToast(message, type = "") {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", type === "error");
    elements.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("visible");
    }, 3600);
  }

  function renderProfile() {
    const { profile } = state;
    document.title = profile.siteName;
    elements.sidebarSiteName.textContent = profile.siteName;
    elements.sidebarTagline.textContent = profile.tagline;
    elements.heroOwnerName.textContent = profile.ownerName;
    elements.heroIntro.textContent = profile.intro || "这里收集我做过的项目、写下的文字和值得回看的片刻。";
    elements.aboutCopy.textContent = profile.about || "在这里介绍你自己。";
    elements.footerSiteName.textContent = profile.siteName;
    elements.footerYear.textContent = String(new Date().getFullYear());
    elements.heroIndex.textContent = `ARCHIVE / ${new Date().getFullYear()}`;
    elements.moduleCount.textContent = String(state.modules.length);
    elements.workCount.textContent = String(state.works.filter((work) => work.status === "published").length);
    elements.profileMonogram.textContent = (profile.ownerName || "你").slice(0, 1);

    if (profile.avatar) {
      elements.profileAvatar.src = profile.avatar;
      elements.profileAvatar.alt = `${profile.ownerName}的头像`;
      elements.profileAvatar.hidden = false;
      elements.profileMonogram.hidden = true;
    } else {
      elements.profileAvatar.removeAttribute("src");
      elements.profileAvatar.hidden = true;
      elements.profileMonogram.hidden = false;
    }
  }

  function moduleWorkCount(moduleId) {
    return state.works.filter((work) => work.moduleId === moduleId).length;
  }

  function renderModuleNavigation() {
    elements.moduleNav.innerHTML = state.modules
      .map((module) => {
        const count = moduleWorkCount(module.id);
        return `
          <a class="module-nav-link ${count ? "" : "is-empty"}" href="#module-${escapeHtml(module.id)}" data-module-jump="${escapeHtml(module.id)}">
            <span class="dot-mark" aria-hidden="true"></span>
            <span>${escapeHtml(module.title)}</span>
            <span class="module-nav-count">${String(count).padStart(2, "0")}</span>
          </a>`;
      })
      .join("");
  }

  function renderModuleSuggestions() {
    elements.moduleSuggestions.innerHTML = state.modules
      .map((module) => `<option value="${escapeHtml(module.title)}"></option>`)
      .join("");
  }

  function workSearchText(work) {
    const module = state.modules.find((item) => item.id === work.moduleId);
    return normalizeForSearch([
      work.title,
      work.summary,
      work.body,
      work.date,
      work.status === "draft" ? "草稿" : "已发布",
      module?.title,
      ...work.tags
    ].join(" "));
  }

  function visibleWorksForModule(moduleId) {
    const query = normalizeForSearch(searchQuery.trim());
    return state.works
      .filter((work) => work.moduleId === moduleId)
      .filter((work) => !query || workSearchText(work).includes(query))
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return a.order - b.order;
      });
  }

  function coverTemplate(work) {
    const source = safeImageSource(work.cover);
    if (source) {
      return `<img src="${escapeHtml(source)}" alt="${escapeHtml(work.title)}封面" loading="lazy">`;
    }
    return `<span class="cover-placeholder" aria-hidden="true">${escapeHtml(work.title.slice(0, 1))}</span>`;
  }

  function workCardTemplate(work) {
    const typeLabel = TYPE_LABELS[work.type] || TYPE_LABELS.mixed;
    const tags = work.tags.slice(0, 4).map((tag) => `
      <button class="tag-chip" type="button" data-action="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join("");
    const summary = work.summary || work.body.slice(0, 160);
    const statusBadge = work.status === "draft" ? `<span class="draft-badge">草稿</span>` : "";
    const interactiveAction = work.interactiveUrl
      ? `<button class="card-button accent" type="button" data-action="open-interactive">进入互动作品 <span aria-hidden="true">↗</span></button>`
      : "";
    return `
      <article class="work-card ${work.featured ? "is-featured" : ""} ${work.status === "draft" ? "is-draft" : ""}"
        data-work-id="${escapeHtml(work.id)}" data-search="${escapeHtml(workSearchText(work))}">
        <button class="work-cover" type="button" data-action="open" aria-label="查看作品：${escapeHtml(work.title)}">
          ${coverTemplate(work)}
          <span class="cover-type">${escapeHtml(typeLabel)}</span>
          ${statusBadge}
        </button>
        <div class="work-body">
          <p class="work-meta">
            <span>${escapeHtml(formatDate(work.date))}</span>
            <span>${work.updatedAt ? `更新于 ${escapeHtml(formatShortDate(work.updatedAt))}` : "已收录"}</span>
          </p>
          <h3 class="work-title">${escapeHtml(work.title)}</h3>
          <p class="work-summary">${escapeHtml(summary || "这件作品暂时没有摘要，打开详情查看完整内容。")}</p>
          ${tags ? `<div class="work-tags">${tags}</div>` : ""}
          <div class="work-footer">
            <div class="work-card-primary-actions">
              <button class="card-button" type="button" data-action="open">作品介绍</button>
              ${interactiveAction}
            </div>
            <div class="work-card-actions">
              <button class="micro-button" type="button" data-action="edit">编辑</button>
              <button class="micro-button" type="button" data-action="move-up" aria-label="上移">↑</button>
              <button class="micro-button" type="button" data-action="move-down" aria-label="下移">↓</button>
              <button class="micro-button delete" type="button" data-action="delete">删除</button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function carouselWorkRowTemplate(work) {
    const typeLabel = TYPE_LABELS[work.type] || TYPE_LABELS.mixed;
    const interactiveAction = work.interactiveUrl
      ? `<button class="micro-button accent" type="button" data-action="open-interactive">互动页</button>`
      : "";
    return `
      <div class="carousel-work-row" data-work-id="${escapeHtml(work.id)}">
        <button class="carousel-work-open" type="button" data-action="open">
          <span class="carousel-work-type">${escapeHtml(typeLabel)}</span>
          <strong>${escapeHtml(work.title)}</strong>
          <small>${escapeHtml(formatDate(work.date))} · ${escapeHtml(work.tags.slice(0, 3).join(" / ") || "作品档案")}</small>
        </button>
        <div class="carousel-work-tools">
          ${interactiveAction}
          <button class="micro-button" type="button" data-action="edit">编辑</button>
          <button class="micro-button" type="button" data-action="move-up" aria-label="上移">↑</button>
          <button class="micro-button" type="button" data-action="move-down" aria-label="下移">↓</button>
          <button class="micro-button delete" type="button" data-action="delete">删除</button>
        </div>
      </div>`;
  }

  function renderWorkspace() {
    let visibleWorkCount = 0;
    elements.workspace.innerHTML = state.modules
      .map((module, index) => {
        const works = visibleWorksForModule(module.id);
        if (!works.length && searchQuery.trim()) return "";
        visibleWorkCount += works.length;
        return `
          <section class="module-section" id="module-${escapeHtml(module.id)}" data-module-id="${escapeHtml(module.id)}">
            <header class="module-header">
              <div class="module-title-wrap">
                <span class="module-number">${String(index + 1).padStart(2, "0")}</span>
                <h2 class="module-title">${escapeHtml(module.title)}</h2>
                ${module.subtitle ? `<p class="module-subtitle">${escapeHtml(module.subtitle)}</p>` : ""}
              </div>
              <div class="module-meta">
                <span>${String(works.length).padStart(2, "0")} 件作品</span>
                <button class="micro-button" type="button" data-add-module="${escapeHtml(module.id)}">＋ 新增</button>
              </div>
            </header>
            ${works.length ? `
              <div class="module-carousel-shell">
                <div class="module-carousel-slot" data-carousel-module="${escapeHtml(module.id)}"></div>
                <p class="carousel-instruction">拖动旋转 · 点击打开作品 · ← → 切换</p>
                <div class="carousel-work-index">
                  ${works.map(carouselWorkRowTemplate).join("")}
                </div>
              </div>` : `
              <div class="empty-state" style="margin-top: 0">
                <h3>这个板块还没有作品</h3>
                <p>新增作品时填入这个板块名，作品就会出现在这里。</p>
                <button class="outline-button" type="button" data-add-module="${escapeHtml(module.id)}">新增作品</button>
              </div>`}
          </section>`;
      })
      .join("");

    const noResults = visibleWorkCount === 0;
    elements.emptyState.hidden = !noResults;
    elements.workspace.hidden = noResults;
    elements.resultsCopy.textContent = searchQuery.trim()
      ? `找到 ${visibleWorkCount} 件作品`
      : `共 ${state.works.length} 件作品`;

    if (noResults && searchQuery.trim()) {
      elements.emptyTitle.textContent = "没有找到匹配作品";
      elements.emptyCopy.textContent = `没有作品匹配“${searchQuery.trim()}”，可以换一个关键词，或清空搜索。`;
      elements.emptyActionButton.textContent = "清空搜索";
    } else {
      elements.emptyTitle.textContent = "还没有作品";
      elements.emptyCopy.textContent = "新增第一件作品，它会连同所属的板块大标题一起出现在首页。";
      elements.emptyActionButton.textContent = "新增作品";
    }

    window.dispatchEvent(new CustomEvent("portfolio:workspace-rendered"));
  }

  function carouselData() {
    if (!state) return { modules: [] };
    return {
      modules: state.modules.map((module, moduleIndex) => ({
        id: module.id,
        title: module.title,
        subtitle: module.subtitle,
        works: visibleWorksForModule(module.id).map((work, workIndex) => ({
          id: work.id,
          src: safeImageSource(work.cover) || makeGeneratedCover(work.title, moduleIndex + workIndex),
          alt: work.summary || work.title,
          title: work.title,
          subtitle: `${TYPE_LABELS[work.type] || TYPE_LABELS.mixed} · ${module.title}`,
          hasInteractive: Boolean(work.interactiveUrl)
        }))
      })).filter((module) => module.works.length)
    };
  }

  function renderRecentAndTags() {
    const recent = [...state.works]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);

    elements.recentList.innerHTML = recent.length
      ? recent.map((work) => {
          const module = state.modules.find((item) => item.id === work.moduleId);
          return `
            <li class="recent-item">
              <button type="button" data-open-work="${escapeHtml(work.id)}">
                <time datetime="${escapeHtml(work.updatedAt)}">${escapeHtml(formatShortDate(work.updatedAt))}</time>
                <strong>${escapeHtml(work.title)}</strong>
                <span>${escapeHtml(module?.title || "未分类")}</span>
              </button>
            </li>`;
        }).join("")
      : `<li class="recent-item"><button type="button" disabled><time>暂无</time><strong>还没有更新记录</strong><span></span></button></li>`;

    const counts = new Map();
    state.works.forEach((work) => work.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
    elements.tagCloud.innerHTML = tags.length
      ? tags.map(([tag, count]) => `
          <button class="tag-chip" type="button" data-tag-jump="${escapeHtml(tag)}">${escapeHtml(tag)} <span>${count}</span></button>
        `).join("")
      : `<span class="tag-chip">添加作品后会自动生成标签</span>`;
  }

  function renderAll() {
    renderProfile();
    renderModuleNavigation();
    renderModuleSuggestions();
    renderWorkspace();
    renderRecentAndTags();
  }

  function getWork(workId) {
    return state.works.find((work) => work.id === workId);
  }

  function getModule(moduleId) {
    return state.modules.find((module) => module.id === moduleId);
  }

  function moveItem(array, from, to) {
    if (to < 0 || to >= array.length) return false;
    const [item] = array.splice(from, 1);
    array.splice(to, 0, item);
    return true;
  }

  function moveWork(workId, direction) {
    const work = getWork(workId);
    if (!work) return;
    const group = state.works
      .filter((item) => item.moduleId === work.moduleId)
      .sort((a, b) => a.order - b.order);
    const currentIndex = group.findIndex((item) => item.id === workId);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= group.length) return;
    moveItem(group, currentIndex, nextIndex);
    group.forEach((item, index) => {
      item.order = index;
    });
    renderWorkspace();
    persistState("作品顺序已更新");
  }

  function deleteWork(workId) {
    const work = getWork(workId);
    if (!work) return;
    if (!window.confirm(`确定删除“${work.title}”吗？删除后不能撤销。`)) return;
    state.works = state.works.filter((item) => item.id !== workId);
    renderAll();
    persistState("作品已删除");
  }

  function detailLinksTemplate(work) {
    if (!work.links.length) return `<p class="tag-chip">没有添加外部链接</p>`;
    return work.links.map((link) => `
      <a class="detail-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
        <span>${escapeHtml(link.label)}</span>
        <span aria-hidden="true">↗</span>
      </a>
    `).join("");
  }

  function detailTagsTemplate(work) {
    return work.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
  }

  function openWorkDetail(workId) {
    const work = getWork(workId);
    if (!work) return;
    const module = getModule(work.moduleId);
    const cover = safeImageSource(work.cover);
    const gallery = work.images
      .map((image) => safeImageSource(image))
      .filter(Boolean)
      .map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(work.title)}作品图 ${index + 2}" loading="lazy">`)
      .join("");
    const paragraphs = (work.body || work.summary || "这件作品暂时没有正文。")
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");

    elements.detailContent.innerHTML = `
      ${cover ? `<img class="detail-hero-image" src="${escapeHtml(cover)}" alt="${escapeHtml(work.title)}封面">` : ""}
      <header class="detail-heading">
        <p class="detail-module">${escapeHtml(module?.title || "未分类")} · ${escapeHtml(TYPE_LABELS[work.type])}</p>
        <h2 id="detailTitle">${escapeHtml(work.title)}</h2>
        <div class="detail-meta">
          <span>${escapeHtml(formatDate(work.date))}</span>
          <span>${work.status === "draft" ? "草稿" : "已发布"}</span>
          <span>${work.updatedAt ? `更新于 ${escapeHtml(formatDate(work.updatedAt.slice(0, 10)))}` : ""}</span>
        </div>
        ${work.interactiveUrl ? `
          <button class="primary-button detail-interactive-button" type="button" data-open-interactive>
            进入互动作品 <span aria-hidden="true">↗</span>
          </button>` : ""}
      </header>
      <div class="detail-layout">
        <div class="detail-body">
          ${work.summary ? `<p class="detail-summary">${escapeHtml(work.summary)}</p>` : ""}
          ${paragraphs}
          ${gallery ? `<div class="detail-gallery">${gallery}</div>` : ""}
        </div>
        <aside class="detail-aside">
          <section>
            <h3>相关链接</h3>
            <div class="detail-links">${detailLinksTemplate(work)}</div>
          </section>
          ${work.tags.length ? `<section><h3>标签</h3><div class="work-tags">${detailTagsTemplate(work)}</div></section>` : ""}
        </aside>
      </div>`;
    currentDetailId = work.id;
    elements.workDetailDialog.showModal();
  }

  function openInteractiveWork(workId) {
    const work = getWork(workId);
    if (!work?.interactiveUrl) {
      showToast("这件作品暂时没有互动页面。", "error");
      return;
    }
    currentDetailId = work.id;
    if (elements.workDetailDialog.open) elements.workDetailDialog.close();
    elements.interactiveDialogTitle.textContent = work.title;
    elements.interactiveFrame.src = work.interactiveUrl;
    elements.interactiveDialog.showModal();
  }

  function closeInteractiveViewer(returnToDetail = false) {
    if (elements.interactiveDialog.open) elements.interactiveDialog.close();
    if (returnToDetail && currentDetailId && getWork(currentDetailId)) {
      window.setTimeout(() => openWorkDetail(currentDetailId), 40);
    }
  }

  function draftImageItems() {
    return [draftCover, ...draftImages].filter(Boolean);
  }

  function setDraftImageList(items) {
    draftCover = items[0] || "";
    draftImages = items.slice(1);
    renderDraftImages();
  }

  function renderDraftImages() {
    const items = draftImageItems();
    elements.imageEditorList.innerHTML = items.map((source, index) => `
      <div class="editor-image ${index === 0 ? "is-cover" : ""}" data-image-index="${index}">
        <img src="${escapeHtml(source)}" alt="待上传图片 ${index + 1}">
        <div class="editor-image-controls">
          ${index === 0
            ? `<span class="tag-chip">封面</span>`
            : `<button type="button" data-image-action="cover" data-image-index="${index}">设为封面</button>`}
          <button type="button" data-image-action="remove" data-image-index="${index}">移除</button>
        </div>
      </div>
    `).join("");
  }

  function openWorkEditor(work = null, moduleId = "") {
    editingWorkId = work?.id || null;
    elements.workEditorTitle.textContent = work ? "编辑作品" : "新增作品";
    elements.fieldModuleTitle.value = work
      ? getModule(work.moduleId)?.title || ""
      : getModule(moduleId)?.title || "";
    elements.fieldWorkTitle.value = work?.title || "";
    elements.fieldWorkType.value = work?.type || "mixed";
    elements.fieldWorkDate.value = work?.date || today();
    elements.fieldWorkStatus.value = work?.status || "published";
    elements.fieldSummary.value = work?.summary || "";
    elements.fieldBody.value = work?.body || "";
    elements.fieldLinks.value = work?.links?.map((link) => `${link.label} | ${link.url}`).join("\n") || "";
    elements.fieldTags.value = work?.tags?.join(", ") || "";
    elements.fieldFeatured.checked = Boolean(work?.featured);
    draftCover = work?.cover || "";
    draftImages = [...(work?.images || [])];
    elements.fieldImages.value = "";
    elements.workFormError.hidden = true;
    renderDraftImages();
    elements.workEditorDialog.showModal();
    window.setTimeout(() => elements.fieldModuleTitle.focus(), 80);
  }

  function closeWorkEditor() {
    elements.workEditorDialog.close();
  }

  function findOrCreateModule(title) {
    const normalized = normalizeForSearch(title);
    let module = state.modules.find((item) => normalizeForSearch(item.title) === normalized);
    if (module) return module;
    module = {
      id: makeId("module"),
      title: cleanText(title, 48),
      subtitle: "新作品板块",
      order: state.modules.length
    };
    state.modules.push(module);
    return module;
  }

  function saveWork(event) {
    event.preventDefault();
    elements.workFormError.hidden = true;
    const moduleTitle = cleanText(elements.fieldModuleTitle.value, 48);
    const title = cleanText(elements.fieldWorkTitle.value, 100);
    if (!moduleTitle || !title) {
      elements.workFormError.textContent = "板块大标题和作品标题都需要填写。";
      elements.workFormError.hidden = false;
      return;
    }

    const module = findOrCreateModule(moduleTitle);
    const existing = editingWorkId ? getWork(editingWorkId) : null;
    const now = new Date().toISOString();
    const work = {
      id: existing?.id || makeId("work"),
      moduleId: module.id,
      title,
      type: Object.hasOwn(TYPE_LABELS, elements.fieldWorkType.value) ? elements.fieldWorkType.value : "mixed",
      summary: cleanText(elements.fieldSummary.value, 320),
      body: cleanText(elements.fieldBody.value, 30_000),
      tags: normalizeTags(elements.fieldTags.value),
      date: elements.fieldWorkDate.value || today(),
      links: parseLinks(elements.fieldLinks.value),
      interactiveUrl: existing?.interactiveUrl || "",
      cover: safeImageSource(draftCover),
      images: draftImages.map(safeImageSource).filter(Boolean),
      status: elements.fieldWorkStatus.value === "draft" ? "draft" : "published",
      featured: elements.fieldFeatured.checked,
      order: existing?.order ?? state.works.filter((item) => item.moduleId === module.id).length,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (existing) {
      state.works = state.works.map((item) => item.id === existing.id ? work : item);
    } else {
      state.works.push(work);
    }

    renderAll();
    persistState(existing ? "作品更新已保存" : "作品已新增");
    closeWorkEditor();
  }

  async function readAndCompressImage(file, options = {}) {
    const maxSize = options.maxSize || 12 * 1024 * 1024;
    const maxWidth = options.maxWidth || 1800;
    const quality = options.quality || 0.86;
    if (!file.type.startsWith("image/")) {
      throw new Error(`${file.name} 不是图片文件。`);
    }
    if (file.size > maxSize) {
      throw new Error(`${file.name} 超过 ${Math.round(maxSize / 1024 / 1024)}MB。`);
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });

    if (file.type === "image/gif") return dataUrl;

    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.addEventListener("load", () => resolve(element));
      element.addEventListener("error", () => reject(new Error(`无法读取图片 ${file.name}。`)));
      element.src = dataUrl;
    });

    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#151b1a";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/webp", quality);
  }

  async function addImages(files, target = "work") {
    const list = [...files];
    if (!list.length) return;
    const zone = target === "work" ? elements.imageUploadZone : null;
    zone?.classList.add("is-loading");
    try {
      for (const file of list) {
        if (target === "avatar") {
          pendingAvatar = await readAndCompressImage(file, { maxWidth: 720, quality: 0.84, maxSize: 8 * 1024 * 1024 });
          renderSettingsAvatar();
        } else {
          const image = await readAndCompressImage(file);
          const items = draftImageItems();
          items.push(image);
          setDraftImageList(items);
        }
      }
      showToast(`${list.length} 张图片已加入`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "图片读取失败。", "error");
    } finally {
      zone?.classList.remove("is-loading");
      elements.fieldImages.value = "";
    }
  }

  function renderSettingsAvatar() {
    if (pendingAvatar) {
      elements.settingsAvatarPreview.src = pendingAvatar;
      elements.settingsAvatarPreview.alt = "头像预览";
      elements.settingsAvatarPreview.hidden = false;
      elements.settingsAvatarFallback.hidden = true;
    } else {
      elements.settingsAvatarPreview.removeAttribute("src");
      elements.settingsAvatarPreview.hidden = true;
      elements.settingsAvatarFallback.textContent = (elements.fieldOwnerName.value || state.profile.ownerName || "你").slice(0, 1);
      elements.settingsAvatarFallback.hidden = false;
    }
  }

  function openSettings(tab = "profile") {
    const profile = state.profile;
    pendingAvatar = profile.avatar;
    elements.fieldSiteName.value = profile.siteName;
    elements.fieldOwnerName.value = profile.ownerName;
    elements.fieldTagline.value = profile.tagline;
    elements.fieldIntro.value = profile.intro;
    elements.fieldAbout.value = profile.about;
    elements.settingsFormError.hidden = true;
    renderSettingsAvatar();
    renderModuleManager();
    setSettingsTab(tab);
    elements.settingsDialog.showModal();
  }

  function setSettingsTab(tab) {
    $$(".settings-tab", elements.settingsDialog).forEach((button) => {
      const selected = button.dataset.settingsTab === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    $$(".settings-panel", elements.settingsDialog).forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== tab;
    });
  }

  function renderModuleManager() {
    if (!state.modules.length) {
      elements.moduleManager.innerHTML = `<div class="module-empty">还没有板块。新增作品并填写大标题后会出现在这里。</div>`;
      return;
    }
    elements.moduleManager.innerHTML = state.modules.map((module, index) => `
      <div class="module-manager-row" data-manager-module="${escapeHtml(module.id)}">
        <input type="text" maxlength="48" value="${escapeHtml(module.title)}" aria-label="第 ${index + 1} 个板块名称">
        <div class="module-manager-actions">
          <button class="micro-button" type="button" data-module-action="up" aria-label="上移板块">↑</button>
          <button class="micro-button" type="button" data-module-action="down" aria-label="下移板块">↓</button>
          <button class="micro-button delete" type="button" data-module-action="delete">删除</button>
        </div>
      </div>
    `).join("");
  }

  function moveModule(moduleId, direction) {
    const index = state.modules.findIndex((module) => module.id === moduleId);
    if (index < 0 || !moveItem(state.modules, index, index + direction)) return;
    state.modules.forEach((module, order) => {
      module.order = order;
    });
    renderModuleManager();
    persistState("板块顺序已更新");
  }

  function deleteModule(moduleId) {
    const module = getModule(moduleId);
    if (!module) return;
    const count = moduleWorkCount(moduleId);
    const message = count
      ? `“${module.title}”中有 ${count} 件作品。删除板块会同时删除这些作品，确定继续吗？`
      : `确定删除板块“${module.title}”吗？`;
    if (!window.confirm(message)) return;
    state.modules = state.modules.filter((item) => item.id !== moduleId);
    state.works = state.works.filter((work) => work.moduleId !== moduleId);
    state.modules.forEach((item, order) => {
      item.order = order;
    });
    renderAll();
    renderModuleManager();
    persistState("板块已删除");
  }

  function saveSettings(event) {
    event.preventDefault();
    elements.settingsFormError.hidden = true;
    const titles = $$(".module-manager-row input", elements.moduleManager).map((input) => cleanText(input.value, 48));
    if (titles.some((title) => !title)) {
      elements.settingsFormError.textContent = "板块名称不能为空。";
      elements.settingsFormError.hidden = false;
      return;
    }
    const normalizedTitles = titles.map(normalizeForSearch);
    if (new Set(normalizedTitles).size !== normalizedTitles.length) {
      elements.settingsFormError.textContent = "板块名称不能重复。";
      elements.settingsFormError.hidden = false;
      return;
    }

    $$(".module-manager-row", elements.moduleManager).forEach((row, index) => {
      const module = getModule(row.dataset.managerModule);
      if (module && titles[index]) module.title = titles[index];
    });

    state.profile = {
      siteName: cleanText(elements.fieldSiteName.value, 48) || "卢朝鑫的作品小屋",
      ownerName: cleanText(elements.fieldOwnerName.value, 32) || "卢朝鑫",
      tagline: cleanText(elements.fieldTagline.value, 90) || "把做过的事，留在这里。",
      intro: cleanText(elements.fieldIntro.value, 600),
      about: cleanText(elements.fieldAbout.value, 1200),
      avatar: safeImageSource(pendingAvatar)
    };
    state.modules.forEach((module, index) => {
      module.order = index;
    });

    renderAll();
    persistState("站点设置已保存");
    elements.settingsDialog.close();
  }

  function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "local-portfolio",
      version: 1,
      profile: state.profile,
      modules: state.modules,
      works: state.works
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `个人作品档案-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("完整备份已导出");
  }

  async function importBackup(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const imported = normalizeState(parsed);
      if (!window.confirm("导入会覆盖当前所有作品和设置，是否继续？")) return;
      state = imported;
      renderAll();
      await persistState("备份已导入");
      elements.settingsDialog.close();
    } catch (error) {
      console.error(error);
      elements.settingsFormError.textContent = error.message || "备份文件无法读取。";
      elements.settingsFormError.hidden = false;
    } finally {
      elements.importBackupInput.value = "";
    }
  }

  function resetDemo() {
    if (!window.confirm("恢复示例会清空当前所有作品、板块和个人设置，确定继续吗？")) return;
    state = createDefaultState();
    renderAll();
    renderModuleManager();
    persistState("已恢复示例内容");
    elements.settingsDialog.close();
  }

  function setLayout(layout, announce = false) {
    currentLayout = LAYOUT_NAMES[layout] ? layout : "index";
    elements.body.dataset.layout = currentLayout;
    localStorage.setItem(LAYOUT_KEY, currentLayout);
    elements.currentLayoutName.textContent = LAYOUT_NAMES[currentLayout];
    $$(".layout-option").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.layoutChoice === currentLayout);
    });
    if (announce) showToast(`已切换为“${LAYOUT_NAMES[currentLayout]}”`);
  }

  function setTheme(theme) {
    currentTheme = theme === "light" ? "light" : "dark";
    elements.body.dataset.theme = currentTheme;
    localStorage.setItem(THEME_KEY, currentTheme);
    elements.themeButtonText.textContent = currentTheme === "dark" ? "切换浅色" : "切换深色";
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    metaTheme?.setAttribute("content", currentTheme === "dark" ? "#1b120d" : "#f2e8da");
  }

  function toggleSidebar(force) {
    const shouldOpen = typeof force === "boolean" ? force : !elements.sidebar.classList.contains("is-open");
    elements.sidebar.classList.toggle("is-open", shouldOpen);
    elements.sidebarScrim.hidden = !shouldOpen;
  }

  function scrollToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    toggleSidebar(false);
  }

  function updateActiveNavigation() {
    const points = [
      { id: "home", nav: "home" },
      { id: "workArchive", nav: "workArchive" },
      { id: "aboutSection", nav: "about" }
    ];
    let active = "home";
    for (const point of points) {
      const element = document.getElementById(point.id);
      if (element && element.getBoundingClientRect().top <= window.innerHeight * 0.34) active = point.nav;
    }
    $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === active));
    elements.breadcrumbCurrent.textContent = active === "home"
      ? "作品档案"
      : active === "workArchive"
        ? "全部作品"
        : "关于";
  }

  function closeDialogByBackdrop(dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function bindEvents() {
    elements.addWorkButton.addEventListener("click", () => openWorkEditor());
    elements.editProfileButton.addEventListener("click", () => openSettings("profile"));
    elements.settingsButton.addEventListener("click", () => openSettings("profile"));
    elements.emptyActionButton.addEventListener("click", () => {
      if (searchQuery.trim()) {
        elements.searchInput.value = "";
        searchQuery = "";
        elements.clearSearchButton.hidden = true;
        renderWorkspace();
        elements.searchInput.focus();
      } else {
        openWorkEditor();
      }
    });
    elements.exploreButton.addEventListener("click", () => scrollToSection("workArchive"));
    elements.closeWorkEditorButton.addEventListener("click", closeWorkEditor);
    elements.cancelWorkEditorButton.addEventListener("click", closeWorkEditor);
    elements.workForm.addEventListener("submit", saveWork);
    elements.closeDetailButton.addEventListener("click", () => elements.workDetailDialog.close());
    elements.closeInteractiveButton.addEventListener("click", () => closeInteractiveViewer(false));
    elements.interactiveBackButton.addEventListener("click", () => closeInteractiveViewer(true));
    elements.interactiveDialog.addEventListener("close", () => {
      elements.interactiveFrame.src = "about:blank";
    });
    elements.editCurrentWorkButton.addEventListener("click", () => {
      const work = getWork(currentDetailId);
      elements.workDetailDialog.close();
      if (work) openWorkEditor(work);
    });
    elements.closeSettingsButton.addEventListener("click", () => elements.settingsDialog.close());
    elements.cancelSettingsButton.addEventListener("click", () => elements.settingsDialog.close());
    elements.settingsForm.addEventListener("submit", saveSettings);
    elements.closeLayoutDialogButton.addEventListener("click", () => elements.layoutDialog.close());
    elements.layoutDoneButton.addEventListener("click", () => elements.layoutDialog.close());
    elements.layoutButton.addEventListener("click", () => {
      setLayout(currentLayout);
      elements.layoutDialog.showModal();
    });
    elements.themeButton.addEventListener("click", () => {
      setTheme(currentTheme === "dark" ? "light" : "dark");
    });
    elements.openSidebarButton.addEventListener("click", () => toggleSidebar(true));
    elements.closeSidebarButton.addEventListener("click", () => toggleSidebar(false));
    elements.sidebarScrim.addEventListener("click", () => toggleSidebar(false));

    $$(".nav-item, .module-nav-link").forEach((link) => {
      link.addEventListener("click", () => toggleSidebar(false));
    });
    $$("[data-scroll]").forEach((button) => {
      button.addEventListener("click", () => scrollToSection(button.dataset.scroll));
    });

    elements.searchInput.addEventListener("input", () => {
      searchQuery = elements.searchInput.value;
      elements.clearSearchButton.hidden = !searchQuery;
      renderWorkspace();
    });
    elements.clearSearchButton.addEventListener("click", () => {
      elements.searchInput.value = "";
      searchQuery = "";
      elements.clearSearchButton.hidden = true;
      renderWorkspace();
      elements.searchInput.focus();
    });

    elements.workspace.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-add-module]");
      if (addButton) {
        openWorkEditor(null, addButton.dataset.addModule);
        return;
      }
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const card = actionButton.closest("[data-work-id]");
      const workId = card?.dataset.workId;
      const work = getWork(workId);
      if (!work) return;
      const action = actionButton.dataset.action;
      if (action === "open") openWorkDetail(workId);
      if (action === "open-interactive") openInteractiveWork(workId);
      if (action === "edit") openWorkEditor(work);
      if (action === "delete") deleteWork(workId);
      if (action === "move-up") moveWork(workId, -1);
      if (action === "move-down") moveWork(workId, 1);
      if (action === "tag") {
        elements.searchInput.value = actionButton.dataset.tag || "";
        searchQuery = elements.searchInput.value;
        elements.clearSearchButton.hidden = false;
        renderWorkspace();
        scrollToSection("workArchive");
      }
    });

    elements.detailContent.addEventListener("click", (event) => {
      const launch = event.target.closest("[data-open-interactive]");
      if (launch && currentDetailId) openInteractiveWork(currentDetailId);
    });

    elements.recentList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-work]");
      if (button) openWorkDetail(button.dataset.openWork);
    });
    elements.tagCloud.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tag-jump]");
      if (!button) return;
      elements.searchInput.value = button.dataset.tagJump || "";
      searchQuery = elements.searchInput.value;
      elements.clearSearchButton.hidden = false;
      renderWorkspace();
      scrollToSection("workArchive");
    });

    elements.fieldImages.addEventListener("change", () => addImages(elements.fieldImages.files, "work"));
    ["dragenter", "dragover"].forEach((eventName) => {
      elements.imageUploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.imageUploadZone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      elements.imageUploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.imageUploadZone.classList.remove("is-dragging");
      });
    });
    elements.imageUploadZone.addEventListener("drop", (event) => {
      addImages(event.dataTransfer.files, "work");
    });
    elements.imageEditorList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-image-action]");
      if (!button) return;
      const index = Number(button.dataset.imageIndex);
      const items = draftImageItems();
      if (button.dataset.imageAction === "remove") items.splice(index, 1);
      if (button.dataset.imageAction === "cover") {
        const [selected] = items.splice(index, 1);
        items.unshift(selected);
      }
      setDraftImageList(items);
    });

    elements.fieldAvatar.addEventListener("change", () => addImages(elements.fieldAvatar.files, "avatar"));
    elements.removeAvatarButton.addEventListener("click", () => {
      pendingAvatar = "";
      renderSettingsAvatar();
    });
    elements.fieldOwnerName.addEventListener("input", renderSettingsAvatar);
    $$(".settings-tab", elements.settingsDialog).forEach((button) => {
      button.addEventListener("click", () => setSettingsTab(button.dataset.settingsTab));
    });
    elements.moduleManager.addEventListener("click", (event) => {
      const button = event.target.closest("[data-module-action]");
      if (!button) return;
      const row = button.closest("[data-manager-module]");
      const moduleId = row?.dataset.managerModule;
      if (!moduleId) return;
      if (button.dataset.moduleAction === "up") moveModule(moduleId, -1);
      if (button.dataset.moduleAction === "down") moveModule(moduleId, 1);
      if (button.dataset.moduleAction === "delete") deleteModule(moduleId);
    });
    elements.exportBackupButton.addEventListener("click", exportBackup);
    elements.importBackupTrigger.addEventListener("click", () => elements.importBackupInput.click());
    elements.importBackupInput.addEventListener("change", () => {
      const file = elements.importBackupInput.files?.[0];
      if (file) importBackup(file);
    });
    elements.resetDemoButton.addEventListener("click", resetDemo);

    $$(".layout-option").forEach((button) => {
      button.addEventListener("click", () => setLayout(button.dataset.layoutChoice));
    });

    closeDialogByBackdrop(elements.workEditorDialog);
    closeDialogByBackdrop(elements.workDetailDialog);
    closeDialogByBackdrop(elements.interactiveDialog);
    closeDialogByBackdrop(elements.settingsDialog);
    closeDialogByBackdrop(elements.layoutDialog);

    let scrollFrame = null;
    window.addEventListener("scroll", () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        updateActiveNavigation();
        scrollFrame = null;
      });
    }, { passive: true });
  }

  globalThis.PortfolioApp = {
    getCarouselData: carouselData,
    openWork(workId) {
      openWorkDetail(workId);
    },
    openInteractive(workId) {
      openInteractiveWork(workId);
    }
  };

  async function init() {
    setLayout(currentLayout);
    setTheme(currentTheme);
    bindEvents();
    state = await loadState();
    renderAll();
    updateActiveNavigation();
  }

  init().catch((error) => {
    console.error(error);
    state = createDefaultState();
    renderAll();
    showToast("本地数据读取失败，当前显示示例内容。", "error");
  });
})();
