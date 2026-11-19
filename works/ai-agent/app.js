(() => {
  "use strict";

  const STORAGE_KEY = "personal-ai-tools-v1";
  const COLOR_KEYS = ["lime", "mint", "orange", "violet"];

  const DEFAULT_TOOLS = [
    {
      id: "tool-workbody",
      name: "workbody",
      monogram: "W",
      focus: "内容组织与学习表达",
      signal: "表达效率",
      color: "lime",
      uses: [
        "完成 PPT 的制作与美化，以及个人简历的美化。",
        "将搜集到的大量复杂资料整合成 Excel 表格及思维导图。",
        "整理国家级赛事获奖项目信息，以及专业课相关知识。"
      ],
      result: "协助完成信息的采集、汇总及提炼，省去大量重复性工作，提高了学习效率；并完成 PPT 和简历制作，避免因自己不会操作而造成的时间浪费。",
      tags: ["PPT", "个人简历", "Excel", "思维导图"]
    },
    {
      id: "tool-codex",
      name: "codex",
      monogram: "C",
      focus: "从想法到可执行代码",
      signal: "开发效率",
      color: "mint",
      uses: [
        "进行代码开发，并定位代码中的 Bug。",
        "把自己的想法落实为可执行的代码。",
        "完成 MLP 的呈现。"
      ],
      result: "辅助我从 0 到 1 完成了一个个人网站的搭建；在代码编写、指导和优化上提供帮助，并完成 MLP 的呈现，提高了编程效率。",
      tags: ["代码开发", "Bug 定位", "网站搭建", "MLP"]
    },
    {
      id: "tool-deepseekharness",
      name: "DeepSeekharness",
      monogram: "DS",
      focus: "论文阅读与知识检索",
      signal: "学习效率",
      color: "orange",
      uses: [
        "进行信息的收集。",
        "伴读学术论文，完成从预读、精读到总结的过程。",
        "搜集并讲解相关的专业知识。"
      ],
      result: "辅助我完成对一篇学术论文的预读、精读和总结，也帮助我搜集与讲解各类专业知识，提高了学习效率。",
      tags: ["信息收集", "论文伴读", "知识讲解"]
    }
  ];

  const elements = {
    body: document.body,
    siteHeader: document.querySelector("#siteHeader"),
    siteNav: document.querySelector("#siteNav"),
    toolNavLinks: document.querySelector("#toolNavLinks"),
    toolSwitcher: document.querySelector("#toolSwitcher"),
    navProgress: document.querySelector("#navProgress"),
    toolIndex: document.querySelector("#tool-index"),
    manageButton: document.querySelector("#manageButton"),
    managementToolbar: document.querySelector("#managementToolbar"),
    addToolButton: document.querySelector("#addToolButton"),
    exportButton: document.querySelector("#exportButton"),
    importButton: document.querySelector("#importButton"),
    importFileInput: document.querySelector("#importFileInput"),
    resetButton: document.querySelector("#resetButton"),
    finishManageButton: document.querySelector("#finishManageButton"),
    searchInput: document.querySelector("#searchInput"),
    clearSearch: document.querySelector("#clearSearch"),
    resultsText: document.querySelector("#resultsText"),
    saveState: document.querySelector("#saveState"),
    statusText: document.querySelector("#statusText"),
    toolList: document.querySelector("#toolList"),
    emptyState: document.querySelector("#emptyState"),
    emptyTitle: document.querySelector("#emptyTitle"),
    emptyCopy: document.querySelector("#emptyCopy"),
    emptyAction: document.querySelector("#emptyAction"),
    toast: document.querySelector("#toast"),
    editorDialog: document.querySelector("#editorDialog"),
    editorTitle: document.querySelector("#editorTitle"),
    toolForm: document.querySelector("#toolForm"),
    closeEditorButton: document.querySelector("#closeEditorButton"),
    cancelEditorButton: document.querySelector("#cancelEditorButton"),
    formError: document.querySelector("#formError"),
    fieldName: document.querySelector("#fieldName"),
    fieldMonogram: document.querySelector("#fieldMonogram"),
    fieldFocus: document.querySelector("#fieldFocus"),
    fieldSignal: document.querySelector("#fieldSignal"),
    fieldUses: document.querySelector("#fieldUses"),
    fieldResult: document.querySelector("#fieldResult"),
    fieldTags: document.querySelector("#fieldTags")
  };

  let tools = [];
  let manageMode = false;
  let editingId = null;
  let draggedId = null;
  let toastTimer = null;
  let scrollFrame = null;

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_TOOLS));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cut(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) {
      return `tool-${globalThis.crypto.randomUUID()}`;
    }
    return `tool-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function uniqueId(candidate, usedIds = new Set()) {
    let id = cut(candidate, 120).replace(/[^\w-]/g, "-");
    if (!id) id = makeId();
    while (usedIds.has(id)) id = makeId();
    usedIds.add(id);
    return id;
  }

  function normalizeTags(tags) {
    const source = Array.isArray(tags) ? tags : String(tags ?? "").split(/[,，]/);
    return [...new Set(source.map((tag) => cut(tag, 32)).filter(Boolean))].slice(0, 16);
  }

  function normalizeUses(uses) {
    const source = Array.isArray(uses) ? uses : String(uses ?? "").split(/\r?\n/);
    return source
      .map((item) => cut(item, 500))
      .filter(Boolean)
      .slice(0, 40);
  }

  function normalizeTools(input) {
    if (!Array.isArray(input)) {
      throw new Error("备份文件中的 tools 必须是数组。");
    }

    const usedIds = new Set();
    return input.map((rawTool, index) => {
      if (!rawTool || typeof rawTool !== "object") {
        throw new Error(`第 ${index + 1} 条记录不是有效对象。`);
      }

      const name = cut(rawTool.name, 60);
      const uses = normalizeUses(rawTool.uses);
      const result = cut(rawTool.result, 5000);

      if (!name || uses.length === 0 || !result) {
        throw new Error(`第 ${index + 1} 条记录缺少工具名称、用途或成效。`);
      }

      const monogram = cut(rawTool.monogram, 4) || name.slice(0, 2).toUpperCase();
      const focus = cut(rawTool.focus, 80) || "个人 AI 使用记录";
      const signal = cut(rawTool.signal, 40) || "已记录";
      const color = COLOR_KEYS.includes(rawTool.color)
        ? rawTool.color
        : COLOR_KEYS[index % COLOR_KEYS.length];

      return {
        id: uniqueId(rawTool.id, usedIds),
        name,
        monogram,
        focus,
        signal,
        color,
        uses,
        result,
        tags: normalizeTags(rawTool.tags)
      };
    });
  }

  function loadTools() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneDefaults();

    try {
      const parsed = JSON.parse(stored);
      return normalizeTools(parsed.tools ?? parsed);
    } catch (error) {
      console.warn("Stored tool data could not be loaded:", error);
      showToast("本地记录无法读取，已恢复初始内容。", "error");
      return cloneDefaults();
    }
  }

  function persistTools(message = "") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        tools
      }));
      elements.saveState.textContent = "已自动保存到当前浏览器";
      if (message) showToast(message);
    } catch (error) {
      console.error("Could not save tool data:", error);
      showToast("保存失败，请先导出备份并检查浏览器存储设置。", "error");
    }
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

  function normalizeForSearch(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  }

  function toolSearchText(tool) {
    return normalizeForSearch([
      tool.name,
      tool.focus,
      tool.signal,
      ...tool.uses,
      tool.result,
      ...tool.tags
    ].join(" "));
  }

  function toolCardTemplate(tool, index) {
    const useItems = tool.uses
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    const tags = tool.tags.length
      ? `<div class="tags" aria-label="相关用途">${tool.tags
          .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";
    const total = String(tools.length).padStart(2, "0");
    const number = String(index + 1).padStart(2, "0");

    return `
      <article class="tool-card" id="tool-${escapeHtml(tool.id)}" data-id="${escapeHtml(tool.id)}" data-color="${escapeHtml(tool.color)}" data-search="${escapeHtml(toolSearchText(tool))}">
        <aside class="tool-rail">
          <div class="tool-monogram" aria-hidden="true">${escapeHtml(tool.monogram)}</div>
          <div class="tool-rail-bottom">
            <span class="tool-number">RECORD ${number} / ${total}</span>
            <p class="tool-focus">${escapeHtml(tool.focus)}</p>
          </div>
        </aside>
        <div class="tool-main">
          <header class="tool-heading">
            <h2>${escapeHtml(tool.name)}</h2>
            <span class="signal-word">${escapeHtml(tool.signal)}</span>
          </header>
          <div class="tool-body">
            <section class="panel">
              <h3 class="panel-label"><span>01</span>使用工具做了什么</h3>
              <ul class="use-list">${useItems}</ul>
            </section>
            <section class="panel result">
              <h3 class="panel-label"><span>02</span>取得了什么成效</h3>
              <p class="result-copy">${escapeHtml(tool.result)}</p>
              ${tags}
            </section>
            <div class="card-admin" aria-label="${escapeHtml(tool.name)} 的管理操作">
              <span class="drag-hint">拖动卡片可排序</span>
              <button class="card-action" type="button" data-action="edit">编辑</button>
              <button class="card-action" type="button" data-action="up">上移</button>
              <button class="card-action" type="button" data-action="down">下移</button>
              <button class="card-action delete" type="button" data-action="delete">删除</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderNavigation() {
    elements.toolNavLinks.innerHTML = tools
      .map((tool) => `
        <a class="nav-tool-link" href="#tool-${escapeHtml(tool.id)}" data-tool-jump="${escapeHtml(tool.id)}">
          <span class="nav-dot" data-color="${escapeHtml(tool.color)}" aria-hidden="true"></span>
          <span>${escapeHtml(tool.name)}</span>
        </a>
      `)
      .join("");

    elements.toolSwitcher.innerHTML = tools
      .map((tool, index) => `
        <a class="tool-switch-link" href="#tool-${escapeHtml(tool.id)}" data-tool-jump="${escapeHtml(tool.id)}" data-color="${escapeHtml(tool.color)}">
          <span class="tool-switch-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="tool-switch-copy">
            <strong>${escapeHtml(tool.name)}</strong>
            <span>${escapeHtml(tool.signal)}</span>
          </span>
        </a>
      `)
      .join("");

    updateScrollUI();
  }

  function renderTools({ focusSearch = false } = {}) {
    elements.toolList.innerHTML = tools.map(toolCardTemplate).join("");
    elements.toolList.querySelectorAll(".tool-card").forEach((card) => {
      card.draggable = manageMode;
      card.classList.add("reveal-pending");
    });
    elements.statusText.textContent = `${tools.length} 条使用记录`;
    renderNavigation();
    applySearch();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elements.toolList.querySelectorAll(".tool-card").forEach((card, index) => {
          window.setTimeout(() => card.classList.remove("reveal-pending"), index * 70);
        });
      });
    });
    if (focusSearch) elements.searchInput.focus();
  }

  function applySearch({ animate = false } = {}) {
    const query = normalizeForSearch(elements.searchInput.value.trim());
    const cards = [...elements.toolList.querySelectorAll(".tool-card")];
    let visible = 0;
    const visibleCards = [];

    cards.forEach((card) => {
      const matched = !query || card.dataset.search.includes(query);
      card.hidden = !matched;
      if (matched) {
        visible += 1;
        visibleCards.push(card);
      }
    });

    elements.resultsText.textContent = query
      ? `找到 ${visible} 条与“${elements.searchInput.value.trim()}”匹配的记录`
      : `显示全部 ${tools.length} 条使用记录`;

    const noResults = visible === 0;
    elements.emptyState.hidden = !noResults;

    if (noResults && query) {
      elements.emptyTitle.textContent = "暂时没有匹配记录";
      elements.emptyCopy.textContent = "换一个用途关键词试试，例如“简历”“代码”或“论文”。";
      elements.emptyAction.textContent = "清空搜索";
      elements.emptyAction.dataset.action = "clear-search";
    } else if (noResults && tools.length === 0) {
      elements.emptyTitle.textContent = "还没有使用记录";
      elements.emptyCopy.textContent = "进入管理内容，新增第一条 AI 工具使用记录。";
      elements.emptyAction.textContent = "新增工具";
      elements.emptyAction.dataset.action = "add-tool";
    } else {
      delete elements.emptyAction.dataset.action;
    }

    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      visibleCards.forEach((card, index) => {
        card.animate(
          [
            { opacity: 0, transform: "translateY(18px)" },
            { opacity: 1, transform: "translateY(0)" }
          ],
          {
            duration: 420,
            delay: Math.min(index * 60, 240),
            easing: "cubic-bezier(.2,.75,.25,1)",
            fill: "both"
          }
        );
      });
    }

    requestScrollUIUpdate();
  }

  function clearSearch() {
    elements.searchInput.value = "";
    applySearch({ animate: true });
    elements.searchInput.focus();
  }

  function setActiveNavigation(activeKey) {
    elements.siteNav.querySelectorAll("[data-nav-section]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.navSection === activeKey);
      if (link.dataset.navSection === activeKey) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    elements.siteNav.querySelectorAll("[data-tool-jump]").forEach((link) => {
      const active = activeKey === `tool-${link.dataset.toolJump}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    elements.toolSwitcher.querySelectorAll("[data-tool-jump]").forEach((link) => {
      const active = activeKey === `tool-${link.dataset.toolJump}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  function updateScrollUI() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    elements.navProgress.style.width = `${progress * 100}%`;
    elements.siteHeader.classList.toggle("is-scrolled", window.scrollY > 8);

    const headerThreshold = elements.siteHeader.getBoundingClientRect().height + 34;
    const cardThreshold = Math.max(headerThreshold, window.innerHeight * .42);
    const hero = document.querySelector(".hero");
    let activeKey = "overview";

    if (elements.toolIndex.getBoundingClientRect().top <= headerThreshold) {
      activeKey = "tools";
    }

    elements.toolList.querySelectorAll(".tool-card").forEach((card) => {
      if (!card.hidden && card.getBoundingClientRect().top <= cardThreshold) {
        activeKey = `tool-${card.dataset.id}`;
      }
    });

    if (hero.getBoundingClientRect().bottom > headerThreshold) {
      activeKey = "overview";
      if (elements.toolIndex.getBoundingClientRect().top > headerThreshold) {
        activeKey = "overview";
      }
    }

    setActiveNavigation(activeKey);
  }

  function requestScrollUIUpdate() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      updateScrollUI();
    });
  }

  function jumpToTool(id) {
    if (elements.searchInput.value) {
      elements.searchInput.value = "";
      applySearch({ animate: true });
    }

    requestAnimationFrame(() => {
      const card = document.querySelector(`#tool-${CSS.escape(id)}`);
      if (!card) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#tool-${id}`);
      window.setTimeout(() => {
        card.classList.remove("nav-focus");
        void card.offsetWidth;
        card.classList.add("nav-focus");
        window.setTimeout(() => card.classList.remove("nav-focus"), 950);
      }, reduceMotion ? 0 : 240);
      setActiveNavigation(`tool-${id}`);
    });
  }

  function setManageMode(nextMode) {
    manageMode = Boolean(nextMode);
    elements.body.classList.toggle("manage-mode", manageMode);
    elements.managementToolbar.hidden = !manageMode;
    elements.manageButton.setAttribute("aria-expanded", String(manageMode));
    elements.manageButton.textContent = manageMode ? "退出管理" : "管理内容";
    renderTools();

    if (manageMode) {
      elements.managementToolbar.scrollIntoView({ behavior: "smooth", block: "nearest" });
      showToast("管理已开启。可新增、编辑、删除或拖动工具卡片排序。");
    }
  }

  function openEditor(tool = null) {
    editingId = tool?.id ?? null;
    elements.editorTitle.textContent = tool ? "编辑 AI 工具" : "新增 AI 工具";
    elements.fieldName.value = tool?.name ?? "";
    elements.fieldMonogram.value = tool?.monogram ?? "";
    elements.fieldFocus.value = tool?.focus ?? "";
    elements.fieldSignal.value = tool?.signal ?? "";
    elements.fieldUses.value = tool?.uses.join("\n") ?? "";
    elements.fieldResult.value = tool?.result ?? "";
    elements.fieldTags.value = tool?.tags.join(", ") ?? "";
    elements.formError.hidden = true;
    elements.formError.textContent = "";

    if (typeof elements.editorDialog.showModal === "function") {
      elements.editorDialog.showModal();
    } else {
      elements.editorDialog.setAttribute("open", "");
    }

    window.setTimeout(() => elements.fieldName.focus(), 30);
  }

  function closeEditor() {
    if (typeof elements.editorDialog.close === "function") {
      elements.editorDialog.close();
    } else {
      elements.editorDialog.removeAttribute("open");
    }
    editingId = null;
  }

  function readForm() {
    const name = cut(elements.fieldName.value, 60);
    const uses = normalizeUses(elements.fieldUses.value);
    const result = cut(elements.fieldResult.value, 5000);

    if (!name) throw new Error("请填写工具名称。");
    if (uses.length === 0) throw new Error("请至少填写一条工具用途。");
    if (!result) throw new Error("请填写取得的成效。");

    return {
      id: editingId || makeId(),
      name,
      monogram: cut(elements.fieldMonogram.value, 4) || name.slice(0, 2).toUpperCase(),
      focus: cut(elements.fieldFocus.value, 80) || "个人 AI 使用记录",
      signal: cut(elements.fieldSignal.value, 40) || "已记录",
      color: editingId
        ? tools.find((tool) => tool.id === editingId)?.color ?? "lime"
        : COLOR_KEYS[tools.length % COLOR_KEYS.length],
      uses,
      result,
      tags: normalizeTags(elements.fieldTags.value)
    };
  }

  function saveTool(event) {
    event.preventDefault();
    elements.formError.hidden = true;

    try {
      const nextTool = readForm();
      const existingIndex = tools.findIndex((tool) => tool.id === editingId);

      if (existingIndex >= 0) {
        tools[existingIndex] = nextTool;
      } else {
        tools.push(nextTool);
      }

      persistTools(existingIndex >= 0 ? "工具记录已更新。" : "新工具已添加。");
      closeEditor();
      renderTools();
    } catch (error) {
      elements.formError.textContent = error.message;
      elements.formError.hidden = false;
    }
  }

  function deleteTool(id) {
    const tool = tools.find((item) => item.id === id);
    if (!tool) return;
    if (!window.confirm(`确定删除“${tool.name}”的整条使用记录吗？`)) return;
    tools = tools.filter((item) => item.id !== id);
    persistTools("工具记录已删除。");
    renderTools();
  }

  function moveTool(id, direction) {
    const index = tools.findIndex((tool) => tool.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= tools.length) return;
    [tools[index], tools[targetIndex]] = [tools[targetIndex], tools[index]];
    persistTools("工具顺序已更新。");
    renderTools();
  }

  function exportTools() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tools
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-agent-tools-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("备份文件已导出。");
  }

  async function importTools(file) {
    if (!file) return;

    try {
      if (file.size > 1_000_000) {
        throw new Error("备份文件超过 1 MB，无法导入。");
      }

      const parsed = JSON.parse(await file.text());
      const importedTools = normalizeTools(parsed.tools ?? parsed);

      if (!window.confirm(`导入后将用 ${importedTools.length} 条记录替换当前内容，是否继续？`)) {
        return;
      }

      tools = importedTools;
      persistTools("备份已导入。");
      renderTools();
    } catch (error) {
      showToast(`导入失败：${error.message}`, "error");
    } finally {
      elements.importFileInput.value = "";
    }
  }

  function resetTools() {
    if (!window.confirm("确定恢复初始的 3 条工具记录吗？当前修改将被覆盖。")) return;
    tools = cloneDefaults();
    persistTools("已恢复初始内容。");
    renderTools();
  }

  function cleanDragState() {
    elements.toolList.querySelectorAll(".tool-card").forEach((card) => {
      card.classList.remove("dragging", "drag-target");
    });
    draggedId = null;
  }

  elements.manageButton.addEventListener("click", () => setManageMode(!manageMode));
  elements.finishManageButton.addEventListener("click", () => setManageMode(false));
  elements.addToolButton.addEventListener("click", () => openEditor());
  elements.exportButton.addEventListener("click", exportTools);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", () => importTools(elements.importFileInput.files?.[0]));
  elements.resetButton.addEventListener("click", resetTools);
  elements.searchInput.addEventListener("input", () => applySearch({ animate: true }));
  elements.clearSearch.addEventListener("click", clearSearch);
  elements.emptyAction.addEventListener("click", () => {
    const action = elements.emptyAction.dataset.action;
    if (action === "add-tool") {
      if (!manageMode) setManageMode(true);
      openEditor();
    } else {
      clearSearch();
    }
  });

  [elements.siteNav, elements.toolSwitcher].forEach((navigation) => {
    navigation.addEventListener("click", (event) => {
      const link = event.target.closest("[data-tool-jump]");
      if (!link) return;
      event.preventDefault();
      jumpToTool(link.dataset.toolJump);
    });
  });

  elements.closeEditorButton.addEventListener("click", closeEditor);
  elements.cancelEditorButton.addEventListener("click", closeEditor);
  elements.toolForm.addEventListener("submit", saveTool);
  elements.editorDialog.addEventListener("click", (event) => {
    if (event.target === elements.editorDialog) closeEditor();
  });

  elements.toolList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    const card = event.target.closest(".tool-card");
    if (!actionButton || !card || !manageMode) return;

    const tool = tools.find((item) => item.id === card.dataset.id);
    if (!tool) return;

    switch (actionButton.dataset.action) {
      case "edit":
        openEditor(tool);
        break;
      case "up":
        moveTool(tool.id, -1);
        break;
      case "down":
        moveTool(tool.id, 1);
        break;
      case "delete":
        deleteTool(tool.id);
        break;
      default:
        break;
    }
  });

  elements.toolList.addEventListener("dragstart", (event) => {
    if (!manageMode) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest(".tool-card");
    if (!card) return;
    draggedId = card.dataset.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
  });

  elements.toolList.addEventListener("dragover", (event) => {
    if (!manageMode || !draggedId) return;
    const card = event.target.closest(".tool-card");
    if (!card || card.dataset.id === draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    elements.toolList.querySelectorAll(".drag-target").forEach((item) => item.classList.remove("drag-target"));
    card.classList.add("drag-target");
  });

  elements.toolList.addEventListener("dragleave", (event) => {
    const card = event.target.closest(".tool-card");
    if (card) card.classList.remove("drag-target");
  });

  elements.toolList.addEventListener("drop", (event) => {
    if (!manageMode || !draggedId) return;
    event.preventDefault();
    const targetCard = event.target.closest(".tool-card");
    if (!targetCard) {
      cleanDragState();
      return;
    }

    const fromIndex = tools.findIndex((tool) => tool.id === draggedId);
    const toIndex = tools.findIndex((tool) => tool.id === targetCard.dataset.id);
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      const [movedTool] = tools.splice(fromIndex, 1);
      tools.splice(toIndex, 0, movedTool);
      persistTools("工具顺序已更新。");
      renderTools();
    }
    cleanDragState();
  });

  elements.toolList.addEventListener("dragend", cleanDragState);

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || event.newValue === null) return;
    try {
      const parsed = JSON.parse(event.newValue);
      tools = normalizeTools(parsed.tools ?? parsed);
      renderTools();
      showToast("内容已从另一个页面同步。");
    } catch (error) {
      console.warn("Could not sync storage update:", error);
    }
  });

  window.addEventListener("scroll", requestScrollUIUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUIUpdate);

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
    if (event.key === "/" && !isTyping && !elements.editorDialog.open) {
      event.preventDefault();
      elements.searchInput.focus();
    }
  });

  tools = loadTools();
  renderTools();
})();
