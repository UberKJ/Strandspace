    const els = {
      home: document.getElementById("ds-home"),
      modeSearch: document.getElementById("mode-search"),
      modeBuilder: document.getElementById("mode-builder"),
      modeQuick: document.getElementById("mode-quick"),
      modePlan: document.getElementById("mode-plan"),
      modeShopping: document.getElementById("mode-shopping"),
      modeSettings: document.getElementById("mode-settings"),
      searchPanel: document.getElementById("search-panel"),
  builderPanel: document.getElementById("builder-panel"),
  quickPanel: document.getElementById("quick-panel"),
  planPanel: document.getElementById("plan-panel"),
  shoppingPanel: document.getElementById("shopping-panel"),
  settingsPanel: document.getElementById("settings-panel"),
  mealFilters: Array.from(document.querySelectorAll(".meal-filter")),
  filterFavorites: document.getElementById("filter-favorites"),
  libraryMeta: document.getElementById("library-meta"),
  recipeCards: document.getElementById("recipe-cards"),
  aiTelemetry: document.getElementById("ai-telemetry"),
  aiTelemetryTitle: document.getElementById("ai-telemetry-title"),
  aiTelemetryDetail: document.getElementById("ai-telemetry-detail"),
  searchInput: document.getElementById("search-input"),
  searchButton: document.getElementById("search-button"),
  searchUseAi: document.getElementById("search-use-ai"),
  selectedBlock: document.getElementById("selected-block"),
  selectedRecipe: document.getElementById("selected-recipe"),
  selectedClear: document.getElementById("selected-clear"),
  browseBlock: document.getElementById("browse-block"),
  browseList: document.getElementById("browse-list"),
  browseEmpty: document.getElementById("browse-empty"),
  browseTitle: document.getElementById("browse-title"),
  matchesBlock: document.getElementById("matches-block"),
  searchMatches: document.getElementById("search-matches"),
  searchHint: document.getElementById("search-hint"),
  searchEmpty: document.getElementById("search-empty"),
  aiBlock: document.getElementById("ai-block"),
  aiRecipe: document.getElementById("ai-recipe"),
  builderStart: document.getElementById("builder-start"),
  builderReset: document.getElementById("builder-reset"),
  builderMessages: document.getElementById("builder-messages"),
  builderInput: document.getElementById("builder-input"),
  builderSend: document.getElementById("builder-send"),
  builderHint: document.getElementById("builder-hint"),
  quickMessages: document.getElementById("quick-messages"),
      quickInput: document.getElementById("quick-input"),
      quickSend: document.getElementById("quick-send"),
      quickHint: document.getElementById("quick-hint"),
    planWeek: document.getElementById("plan-week"),
    planLoad: document.getElementById("plan-load"),
    planCreate: document.getElementById("plan-create"),
    planPrint: document.getElementById("plan-print"),
    planHint: document.getElementById("plan-hint"),
    planGrid: document.getElementById("plan-grid"),
    planSelected: document.getElementById("plan-selected"),
    planDay: document.getElementById("plan-day"),
    planSlot: document.getElementById("plan-slot"),
    planServings: document.getElementById("plan-servings"),
    planAdd: document.getElementById("plan-add"),
    planGenerateShopping: document.getElementById("plan-generate-shopping"),
    shoppingHint: document.getElementById("shopping-hint"),
    shoppingLists: document.getElementById("shopping-lists"),
    shoppingTitle: document.getElementById("shopping-title"),
    shoppingItems: document.getElementById("shopping-items"),
    shoppingNew: document.getElementById("shopping-new"),
    shoppingPrint: document.getElementById("shopping-print"),
    shoppingItemName: document.getElementById("shopping-item-name"),
    shoppingItemAmount: document.getElementById("shopping-item-amount"),
    shoppingItemUnit: document.getElementById("shopping-item-unit"),
    shoppingItemAdd: document.getElementById("shopping-item-add"),
    settingsExport: document.getElementById("settings-export"),
    settingsUserCurrent: document.getElementById("settings-user-current"),
    settingsUserSelect: document.getElementById("settings-user-select"),
    settingsUserRefresh: document.getElementById("settings-user-refresh"),
    settingsUserName: document.getElementById("settings-user-name"),
    settingsUserPin: document.getElementById("settings-user-pin"),
    settingsUserCreate: document.getElementById("settings-user-create"),
    settingsUserPinVerify: document.getElementById("settings-user-pin-verify"),
    settingsUserVerify: document.getElementById("settings-user-verify"),
    settingsPinLock: document.getElementById("settings-pin-lock"),
    settingsUserStatus: document.getElementById("settings-user-status"),
    settingsActiveTextProvider: document.getElementById("settings-active-text-provider"),
    settingsActiveImageProvider: document.getElementById("settings-active-image-provider"),
    settingsActiveProviderStatus: document.getElementById("settings-active-provider-status"),
    settingsProvider: document.getElementById("settings-provider"),
    settingsProviderRefresh: document.getElementById("settings-provider-refresh"),
    settingsProviderApiKey: document.getElementById("settings-provider-api-key"),
    settingsProviderBaseUrl: document.getElementById("settings-provider-base-url"),
    settingsProviderModel: document.getElementById("settings-provider-model"),
    settingsProviderModels: document.getElementById("settings-provider-models"),
    settingsProviderImageModel: document.getElementById("settings-provider-image-model"),
    settingsProviderImageModels: document.getElementById("settings-provider-image-models"),
    settingsProviderSave: document.getElementById("settings-provider-save"),
    settingsProviderClear: document.getElementById("settings-provider-clear"),
    settingsProviderStatus: document.getElementById("settings-provider-status"),
    settingsProviderTest: document.getElementById("settings-provider-test"),
    settingsProviderTestStatus: document.getElementById("settings-provider-test-status"),
    settingsProfileSelect: document.getElementById("settings-profile-select"),
    settingsProfileActivate: document.getElementById("settings-profile-activate"),
    settingsProfileClearActive: document.getElementById("settings-profile-clear-active"),
    settingsProfileDelete: document.getElementById("settings-profile-delete"),
    settingsProfileLabel: document.getElementById("settings-profile-label"),
    settingsProfileProvider: document.getElementById("settings-profile-provider"),
    settingsProfileApiKey: document.getElementById("settings-profile-api-key"),
    settingsProfileBaseUrl: document.getElementById("settings-profile-base-url"),
    settingsProfileModel: document.getElementById("settings-profile-model"),
    settingsProfileModels: document.getElementById("settings-profile-models"),
    settingsProfileSave: document.getElementById("settings-profile-save"),
    settingsProfileTest: document.getElementById("settings-profile-test"),
    settingsProfileSetActive: document.getElementById("settings-profile-set-active"),
    settingsProfileStatus: document.getElementById("settings-profile-status"),
    settingsImportFile: document.getElementById("settings-import-file"),
    settingsImportOverwrite: document.getElementById("settings-import-overwrite"),
    settingsImportApply: document.getElementById("settings-import-apply"),
    settingsImportStatus: document.getElementById("settings-import-status"),
    settingsImportPreview: document.getElementById("settings-import-preview"),
    settingsShareFile: document.getElementById("settings-share-file"),
    settingsShareOverwrite: document.getElementById("settings-share-overwrite"),
    settingsShareImport: document.getElementById("settings-share-import"),
    settingsShareStatus: document.getElementById("settings-share-status"),
    settingsSharePreview: document.getElementById("settings-share-preview")
    };

let activeMealFilter = "";
let favoritesOnly = false;
let builderSessionId = "";
let builderStage = "";
let cachedLibrary = [];
let selectedRecipeId = "";
let activeMealPlanId = "";
let pendingPlanRecipe = null;
let activeShoppingListId = "";
let cachedShoppingLists = [];
let pendingImportBackup = null;
let pendingSharePackage = null;

// PROVIDER_DEFS is populated at runtime from /api/diabetic/provider-catalog.
// We seed it with the same defaults the server ships so the UI still renders
// gracefully if the catalog fetch is slow or fails.
const PROVIDER_DEFS = {
  openai: {
    label: "OpenAI (Responses)",
    supports: { text: true, image: true },
    fields: { api_key: true, base_url: false, model: true, image_model: true },
    defaults: {}
  },
  openai_chat: {
    label: "OpenAI-compatible (Chat)",
    supports: { text: true, image: false },
    fields: { api_key: true, base_url: true, model: true, image_model: false },
    defaults: {}
  },
  ollama: {
    label: "Ollama (local)",
    supports: { text: true, image: false },
    fields: { api_key: false, base_url: true, model: true, image_model: false },
    defaults: { base_url: "http://localhost:11434", model: "llama3.1" }
  },
  none: {
    label: "Disabled",
    supports: { text: false, image: false },
    fields: { api_key: false, base_url: false, model: false, image_model: false },
    defaults: {}
  }
};

let providerCatalogLoaded = false;
let cachedProfiles = [];
let cachedActiveProfileId = "";

function applyProviderDef(id, def) {
  PROVIDER_DEFS[id] = {
    label: String(def.label ?? id),
    supports: { text: Boolean(def.supports?.text), image: Boolean(def.supports?.image) },
    fields: {
      api_key: Boolean(def.fields?.api_key),
      base_url: Boolean(def.fields?.base_url),
      model: Boolean(def.fields?.model),
      image_model: Boolean(def.fields?.image_model)
    },
    defaults: { ...(def.defaults ?? {}) }
  };
}

function rebuildProviderSelects() {
  const fillSelect = (selectEl, { textOnly = false, imageOnly = false, includeNone = true } = {}) => {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = "";
    for (const [id, def] of Object.entries(PROVIDER_DEFS)) {
      if (id === "none" && !includeNone) continue;
      if (textOnly && !def.supports.text && id !== "none") continue;
      if (imageOnly && !def.supports.image && id !== "none") continue;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = def.label;
      selectEl.appendChild(option);
    }
    if (previousValue && PROVIDER_DEFS[previousValue]) {
      selectEl.value = previousValue;
    }
  };

  fillSelect(els.settingsActiveTextProvider, { textOnly: true });
  fillSelect(els.settingsActiveImageProvider, { imageOnly: true });
  fillSelect(els.settingsProvider, { textOnly: false });
  fillSelect(els.settingsProfileProvider, { textOnly: true, includeNone: false });
}

async function ensureProviderCatalog() {
  if (providerCatalogLoaded) return;
  const { response, data } = await getJson("/api/diabetic/provider-catalog");
  if (response?.ok && Array.isArray(data?.providers)) {
    for (const entry of data.providers) {
      if (entry?.id) applyProviderDef(entry.id, entry);
    }
  }
  providerCatalogLoaded = true;
  rebuildProviderSelects();
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMilliseconds(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  const numeric = Number(value);
  return `${numeric.toFixed(numeric >= 10 ? 1 : 3)} ms`;
}

function formatTokens(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  return `${Math.round(Number(value))}`;
}

function populateModelDatalist(datalistEl, models) {
  if (!datalistEl) return;
  const list = Array.isArray(models) ? models.map((m) => String(m ?? "").trim()).filter(Boolean) : [];
  datalistEl.innerHTML = "";
  for (const id of list.slice(0, 120)) {
    const option = document.createElement("option");
    option.value = id;
    datalistEl.appendChild(option);
  }
}

function summarizeModelList(models) {
  const list = Array.isArray(models) ? models.map((m) => String(m ?? "").trim()).filter(Boolean) : [];
  if (!list.length) return "";
  return list.slice(0, 6).join(", ") + (list.length > 6 ? ` (+${list.length - 6} more)` : "");
}

function normalizeAssetUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replaceAll("\\", "/");
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://") || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("/")) return cleaned;
  return `/${cleaned.replace(/^\.\//, "")}`;
}

function setTelemetry({ phase = "idle", title = "", detail = "" } = {}) {
  if (!els.aiTelemetry || !els.aiTelemetryTitle || !els.aiTelemetryDetail) return;
  els.aiTelemetry.className = `ds-telemetry${phase === "loading" ? " loading" : ""}${phase === "error" ? " error" : ""}`;
  els.aiTelemetryTitle.textContent = title || "AI idle.";
  els.aiTelemetryDetail.textContent = detail || "No AI work yet.";
}

function summarizeMetrics(metrics = null) {
  const localMs = metrics?.local?.latencyMs ?? null;
  const llmMs = metrics?.llm?.latencyMs ?? null;
  const imageMs = metrics?.image?.latencyMs ?? null;
  const parts = [];
  if (Number.isFinite(Number(localMs))) parts.push(`Local ${formatMilliseconds(localMs)}`);
  if (Number.isFinite(Number(llmMs))) parts.push(`LLM ${formatMilliseconds(llmMs)}`);
  if (Number.isFinite(Number(imageMs))) parts.push(`Image ${formatMilliseconds(imageMs)}`);
  return parts.join(" • ");
}

function summarizeTokens(llm = null) {
  if (!llm) return "";
  if (!Number.isFinite(Number(llm.inputTokens)) && !Number.isFinite(Number(llm.totalTokens))) return "";
  return `Tokens in ${formatTokens(llm.inputTokens)} • out ${formatTokens(llm.outputTokens)} • total ${formatTokens(llm.totalTokens)}`;
}

function startAiTelemetry(kind, message) {
  setTelemetry({
    phase: "loading",
    title: kind || "AI working...",
    detail: message || "Sending request..."
  });
}

function finishTelemetry(kind, payload = {}) {
  const metrics = payload?.metrics ?? null;
  const route = String(payload?.route ?? "").trim();
  const llm = metrics?.llm ?? null;
  const timing = summarizeMetrics(metrics);
  const tokens = summarizeTokens(llm);
  const providerBits = [];
  if (llm?.provider) {
    const model = String(llm.model ?? "").trim();
    providerBits.push(`${llm.provider}${model ? `:${model}` : ""}`);
  }
  if (metrics?.image?.provider) {
    const imageModel = String(metrics.image.model ?? "").trim();
    providerBits.push(`${metrics.image.provider}${imageModel ? `:${imageModel}` : ""}`);
  }
  const providerLabel = providerBits.length ? ` • ${providerBits.join(" • ")}` : "";
  setTelemetry({
    phase: "idle",
    title: `${kind || "Done"}${route ? ` • ${route}` : ""}${timing ? ` • ${timing}` : ""}${providerLabel}`,
    detail: tokens || (metrics?.image?.imageUrl ? `Image: ${metrics.image.imageUrl}` : "Ready.")
  });
}

function failTelemetry(kind, message) {
  setTelemetry({
    phase: "error",
    title: kind || "AI failed.",
    detail: message || "Request failed."
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function ensureImageForRecipe(recipe, card, statusEl, { force = false } = {}) {
  if (!recipe || !card) return;
  if (!recipe.recipe_id) return;
  if (!force && String(recipe.image_url ?? "").trim()) return;
  if (card.dataset.imageEnsuring === "1") return;
  card.dataset.imageEnsuring = "1";

  if (statusEl) {
    statusEl.textContent = "Generating image...";
  }

  startAiTelemetry("Generating image", `Creating a photo for "${recipe.title || recipe.recipe_id}"...`);
  const { response, data } = await postJson("/api/diabetic/ensure-image", { recipe_id: recipe.recipe_id, force });
  if (!response.ok) {
    const msg = data?.error || `HTTP ${response.status}`;
    if (statusEl) {
      statusEl.textContent = msg;
    }
    failTelemetry("Image failed", msg);
    delete card.dataset.imageEnsuring;
    return;
  }

  const imageUrl = normalizeAssetUrl(data?.recipe?.image_url ?? data?.image_url ?? "");
  if (imageUrl) {
    recipe.image_url = data.recipe?.image_url ?? recipe.image_url;
    const existing = card.querySelector(".ds-recipe-image");
    if (!existing) {
      const img = document.createElement("img");
      img.className = "ds-recipe-image";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = recipe.title || "Recipe image";
      img.src = imageUrl;
      card.prepend(img);
    } else {
      existing.src = imageUrl;
    }
    if (statusEl) {
      statusEl.textContent = "Image saved ✓";
      setTimeout(() => {
        if (statusEl.textContent === "Image saved ✓") statusEl.textContent = "";
      }, 1600);
    }
  } else if (statusEl) {
    statusEl.textContent = "Image unavailable";
  }

  finishTelemetry("Image ready", data);
  void refreshLibrary();
  delete card.dataset.imageEnsuring;
}

function listImageCreatorChoices() {
  const choices = Object.entries(PROVIDER_DEFS)
    .filter(([id, def]) => id !== "none" && Boolean(def?.supports?.image))
    .map(([id, def]) => `${String(def?.label ?? id)} (${id})`);
  return choices.length ? choices : ["OpenAI (openai)"];
}

async function resolveActiveImageProviderId() {
  try {
    const { response, data } = await getJson("/api/diabetic/provider-settings?provider_id=app");
    if (response?.ok) {
      const settings = Array.isArray(data?.settings) ? data.settings : [];
      const row = settings.find((r) => r.key === "active_image_provider") ?? null;
      const value = String(row?.value ?? "").trim().toLowerCase();
      if (value) return value;
    }
  } catch {
    // ignore
  }

  const fallback = String(els.settingsActiveImageProvider?.value ?? "openai").trim().toLowerCase();
  return fallback || "openai";
}

async function confirmCreateImage(recipe, { force = false } = {}) {
  await ensureProviderCatalog();
  const providerId = await resolveActiveImageProviderId();
  const effectiveId = PROVIDER_DEFS[providerId]?.supports?.image ? providerId : "openai";
  const label = PROVIDER_DEFS[effectiveId]?.label ?? effectiveId;

  const title = String(recipe?.title ?? recipe?.recipe_id ?? "this recipe").trim();
  const action = force ? "regenerate" : "create";
  const choices = listImageCreatorChoices();

  const message = [
    `Are you sure you want to ${action} an image for:`,
    `"${title}"?`,
    "",
    `Active image provider: ${label} (${effectiveId})`,
    "",
    "Available image creators:",
    ...choices.map((c) => `- ${c}`),
    "",
    "Tip: change this in Settings -> Active image provider.",
    "This may use paid API credits."
  ].join("\n");

  return window.confirm(message);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function uploadImageForRecipe(recipe, card, file, statusEl) {
  if (!recipe || !card) return;
  if (!recipe.recipe_id) return;
  if (!file) return;
  if (file.size > 1_800_000) {
    if (statusEl) statusEl.textContent = "Image must be 1.8MB or smaller.";
    return;
  }

  if (statusEl) statusEl.textContent = "Uploading image...";

  let dataUrl = "";
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (error) {
    if (statusEl) statusEl.textContent = error instanceof Error ? error.message : "Failed to read image.";
    return;
  }

  const { response, data } = await postJson("/api/diabetic/recipe-image/upload", {
    recipe_id: recipe.recipe_id,
    data_url: dataUrl,
    content_type: file.type || null
  });

  if (!response.ok) {
    if (statusEl) statusEl.textContent = data?.error || `Upload failed (HTTP ${response.status}).`;
    return;
  }

  const imageUrl = normalizeAssetUrl(data?.recipe?.image_url ?? data?.image_url ?? "");
  if (imageUrl) {
    recipe.image_url = data.recipe?.image_url ?? recipe.image_url;
    const existing = card.querySelector(".ds-recipe-image");
    if (!existing) {
      const img = document.createElement("img");
      img.className = "ds-recipe-image";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = recipe.title || "Recipe image";
      img.src = imageUrl;
      card.prepend(img);
    } else {
      existing.src = imageUrl;
    }
  }

  if (statusEl) {
    statusEl.textContent = "Uploaded ✓";
    setTimeout(() => {
      if (statusEl.textContent === "Uploaded ✓") statusEl.textContent = "";
    }, 1600);
  }

  void refreshLibrary();
}

function setMode(mode) {
  const search = mode === "search";
  const builder = mode === "builder";
  const quick = mode === "quick";
  const plan = mode === "plan";
  const shopping = mode === "shopping";
  const settings = mode === "settings";

  els.modeSearch.setAttribute("aria-pressed", search ? "true" : "false");
  els.modeBuilder.setAttribute("aria-pressed", builder ? "true" : "false");
  els.modeQuick.setAttribute("aria-pressed", quick ? "true" : "false");
  els.modePlan.setAttribute("aria-pressed", plan ? "true" : "false");
  els.modeShopping.setAttribute("aria-pressed", shopping ? "true" : "false");
  els.modeSettings.setAttribute("aria-pressed", settings ? "true" : "false");

  els.searchPanel.style.display = search ? "" : "none";
  els.builderPanel.style.display = builder ? "" : "none";
  els.quickPanel.style.display = quick ? "" : "none";
  els.planPanel.style.display = plan ? "" : "none";
  els.shoppingPanel.style.display = shopping ? "" : "none";
  els.settingsPanel.style.display = settings ? "" : "none";

  if (search) {
    setTimeout(() => els.searchInput?.focus?.(), 0);
  } else if (builder) {
    setTimeout(() => els.builderInput?.focus?.(), 0);
  } else if (quick) {
    setTimeout(() => els.quickInput?.focus?.(), 0);
  } else if (plan) {
    setTimeout(() => els.planWeek?.focus?.(), 0);
  } else if (shopping) {
    setTimeout(() => els.shoppingItemName?.focus?.(), 0);
  } else if (settings) {
    setTimeout(() => els.settingsExport?.focus?.(), 0);
    void refreshUsers();
    (async () => {
      await ensureProviderCatalog();
      await refreshProfiles();
      await refreshActiveProviders();
      await refreshProviderSettings();
    })();
  }
}

    function setMealFilter(meal) {
      clearSelectedRecipe();
      activeMealFilter = String(meal ?? "");
      for (const btn of els.mealFilters) {
        const value = String(btn.dataset.meal ?? "");
        btn.setAttribute("aria-pressed", value === activeMealFilter ? "true" : "false");
      }
      void refreshLibrary();
    }

  function setFavoritesOnly(next) {
    favoritesOnly = Boolean(next);
    els.filterFavorites?.setAttribute("aria-pressed", favoritesOnly ? "true" : "false");
    clearSelectedRecipe();
    void refreshLibrary();
  }

    function goHome() {
      setMode("search");

      selectedRecipeId = "";
      clearSelectedRecipe();
      clearSearchResults();

      if (els.searchHint) els.searchHint.textContent = "";
      if (els.searchInput) els.searchInput.value = "";
      if (els.searchUseAi) els.searchUseAi.checked = false;

      builderSessionId = "";
      builderStage = "";
      if (els.builderMessages) els.builderMessages.innerHTML = "";
      if (els.builderHint) els.builderHint.textContent = "";
      if (els.builderInput) els.builderInput.value = "";

      if (els.quickMessages) els.quickMessages.innerHTML = "";
      if (els.quickHint) els.quickHint.textContent = "";
      if (els.quickInput) els.quickInput.value = "";

      if (els.recipeCards) els.recipeCards.innerHTML = "";

    favoritesOnly = false;
    els.filterFavorites?.setAttribute("aria-pressed", "false");
    activeMealPlanId = "";
    pendingPlanRecipe = null;
    if (els.planSelected) els.planSelected.textContent = "(none)";
    if (els.planHint) els.planHint.textContent = "";
    if (els.planGrid) els.planGrid.innerHTML = "";
    activeShoppingListId = "";
    cachedShoppingLists = [];
    if (els.shoppingHint) els.shoppingHint.textContent = "";
    if (els.shoppingLists) els.shoppingLists.innerHTML = "";
    if (els.shoppingTitle) els.shoppingTitle.textContent = "No list selected";
    if (els.shoppingItems) els.shoppingItems.innerHTML = "";
    els.shoppingPrint?.setAttribute("disabled", "");
      setMealFilter("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

function appendMessage(container, role, text) {
  const bubble = document.createElement("div");
  bubble.className = `ds-bubble ${role}`;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function routeBadge(route) {
  if (route === "local_recall") return { label: "⚡ Recalled locally", cls: "route-local" };
  if (route === "api_validate") return { label: "🔍 AI validated", cls: "route-validate" };
  return { label: "🤖 AI generated", cls: "route-expand" };
}

function renderRecipeCard({ recipe, route, statusText = "" }) {
  if (!recipe) return null;
  const card = document.createElement("article");
  card.className = "ds-card";
  const routeMeta = routeBadge(route);
  const substitutes = Array.isArray(recipe.substitutes) ? recipe.substitutes : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const imageUrl = normalizeAssetUrl(recipe.image_url);
  const rating = Number.isFinite(Number(recipe.rating)) ? Number(recipe.rating) : 0;
  const favorite = Number(recipe.favorite ?? 0) ? 1 : 0;

  card.innerHTML = `
    ${imageUrl ? `<img class="ds-recipe-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(recipe.title || "Recipe image")}" loading="lazy" decoding="async" />` : ""}
    <h3>${escapeHtml(recipe.title || "Recipe")}</h3>
    <div class="ds-badges">
      <span class="ds-badge status-badge status-neutral">${escapeHtml(recipe.meal_type || "meal")}</span>
      <span class="ds-badge status-badge ${escapeHtml(routeMeta.cls)}">${escapeHtml(routeMeta.label)}</span>
      ${recipe.gi_notes ? `<span class="ds-badge status-badge status-success">GI notes</span>` : ""}
    </div>
    <div class="ds-recipe-controls" aria-label="Recipe rating and favorite">
      <div class="ds-rating" role="group" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map((star) => `
          <button class="ds-star${star <= rating ? " filled" : ""}" type="button" data-star="${star}" aria-label="Rate ${star} star${star === 1 ? "" : "s"}">★</button>
        `).join("")}
      </div>
      <button class="ds-favorite${favorite ? " active" : ""}" type="button" aria-pressed="${favorite ? "true" : "false"}" aria-label="Toggle favorite">♥</button>
    </div>
    ${recipe.gi_notes ? `<p><strong>GI notes:</strong> ${escapeHtml(recipe.gi_notes)}</p>` : ""}
    ${recipe.description ? `<p>${escapeHtml(recipe.description)}</p>` : ""}
    <hr />
    <p><strong>Ingredients</strong></p>
    <ul>
      ${(Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((ing) => {
        const amount = ing?.amount ?? "";
        const unit = ing?.unit ?? "";
        const note = ing?.note ? ` (${ing.note})` : "";
        return `<li>${escapeHtml(`${amount} ${unit} ${ing?.name ?? ""}`.replace(/\\s+/g, " ").trim())}${escapeHtml(note)}</li>`;
      }).join("")}
    </ul>
    ${substitutes.length ? `
      <p class="ds-section-space"><strong>Substitutes</strong></p>
      <ul>
        ${substitutes.map((sub) => `<li>${escapeHtml(sub.original)} → ${escapeHtml(sub.substitute)}${sub.reason ? ` (${escapeHtml(sub.reason)})` : ""}</li>`).join("")}
      </ul>
    ` : ""}
    <p class="ds-section-space"><strong>Instructions</strong></p>
    <ol>
      ${(Array.isArray(recipe.instructions) ? recipe.instructions : []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
    </ol>
    <p class="ds-section-space"><strong>Servings:</strong> ${escapeHtml(recipe.servings ?? "")} ${recipe.serving_notes ? `· ${escapeHtml(recipe.serving_notes)}` : ""}</p>
    ${tags.length ? `<p><strong>Tags:</strong> ${escapeHtml(tags.join(", "))}</p>` : ""}
    <div class="ds-card-actions">
      <button class="save primary-action" type="button">Save</button>
      <button class="discard ghost-action" type="button">Discard</button>
      <button class="adapt ghost-action" type="button">Adapt Recipe</button>
      <button class="plan ghost-action" type="button">Add to Plan</button>
      <button class="print ghost-action" type="button">Print</button>
      <button class="share ghost-action" type="button">Share/Export</button>
      <button class="image-create ghost-action" type="button">${imageUrl ? "Regenerate image" : "Create image"}</button>
      <button class="image-upload ghost-action" type="button">Upload image</button>
      <input class="image-upload-input" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" />
      <span class="ds-muted status"></span>
    </div>
    <div class="ds-adapt-row" style="display:none;">
      <input class="adapt-input ds-input" type="text" placeholder="e.g. make it gluten-free, reduce servings to 2, make it dairy-free" />
      <button class="adapt-send ghost-action" type="button">Adapt</button>
    </div>
  `;

  const status = card.querySelector(".status");
  const saveBtn = card.querySelector("button.save");
  const discardBtn = card.querySelector("button.discard");
  const adaptBtn = card.querySelector("button.adapt");
  const planBtn = card.querySelector("button.plan");
  const printBtn = card.querySelector("button.print");
  const shareBtn = card.querySelector("button.share");
  const adaptRow = card.querySelector(".ds-adapt-row");
  const adaptInput = card.querySelector(".adapt-input");
  const adaptSend = card.querySelector(".adapt-send");
  const starButtons = Array.from(card.querySelectorAll("button.ds-star"));
  const favoriteBtn = card.querySelector("button.ds-favorite");
  const imageCreateBtn = card.querySelector("button.image-create");
  const imageUploadBtn = card.querySelector("button.image-upload");
  const imageUploadInput = card.querySelector("input.image-upload-input");

  status.textContent = statusText;

  const renderStars = (value) => {
    for (const btn of starButtons) {
      const star = Number(btn.dataset.star ?? 0);
      btn.classList.toggle("filled", star <= value);
    }
  };

  renderStars(rating);

  for (const btn of starButtons) {
    btn.addEventListener("click", async () => {
      const nextRating = Number(btn.dataset.star ?? 0);
      if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5) return;
      status.textContent = "Rating...";
      const { response, data } = await postJson("/api/diabetic/rate", { recipe_id: recipe.recipe_id, rating: nextRating });
      if (!response.ok) {
        status.textContent = data?.error || "Rating failed";
        return;
      }
      recipe.rating = data?.recipe?.rating ?? nextRating;
      renderStars(Number(recipe.rating ?? nextRating));
      status.textContent = "Rated ✓";
      setTimeout(() => {
        if (status.textContent === "Rated ✓") status.textContent = "";
      }, 1200);
      void refreshLibrary();
    });
  }

  favoriteBtn?.addEventListener("click", async () => {
    const next = Number(recipe.favorite ?? 0) ? 0 : 1;
    status.textContent = next ? "Favoriting..." : "Removing favorite...";
    const { response, data } = await postJson("/api/diabetic/favorite", { recipe_id: recipe.recipe_id, favorite: next });
    if (!response.ok) {
      status.textContent = data?.error || "Favorite failed";
      return;
    }
    recipe.favorite = data?.recipe?.favorite ?? next;
    const isFav = Number(recipe.favorite ?? 0) ? 1 : 0;
    favoriteBtn.classList.toggle("active", Boolean(isFav));
    favoriteBtn.setAttribute("aria-pressed", isFav ? "true" : "false");
    status.textContent = isFav ? "Favorited ✓" : "Unfavorited ✓";
    setTimeout(() => {
      if (status.textContent.endsWith("✓")) status.textContent = "";
    }, 1200);
    void refreshLibrary();
  });

  planBtn?.addEventListener("click", async () => {
    pendingPlanRecipe = { recipe_id: recipe.recipe_id, title: recipe.title || recipe.recipe_id };
    if (els.planSelected) {
      els.planSelected.textContent = pendingPlanRecipe.title;
    }
    setMode("plan");
    const weekStart = ensureMealPlanWeekInput();
    if (weekStart) {
      await loadMealPlanWeek(weekStart);
    }
    els.planAdd?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });

  printBtn?.addEventListener("click", () => {
    if (!recipe?.recipe_id) return;
    window.open(`/print/recipe.html?recipe_id=${encodeURIComponent(recipe.recipe_id)}`, "_blank");
  });

  shareBtn?.addEventListener("click", async () => {
    await exportRecipeSharePackage(recipe, status);
  });

  saveBtn.addEventListener("click", async () => {
    status.textContent = "Saving…";
    // Image generation is manual: use the "Create image" button.
    const { response, data } = await postJson("/api/diabetic/save", recipe);
    status.textContent = response.ok ? "Saved locally ✓" : "Save failed";
    if (response.ok && data?.image_url && !recipe.image_url) {
      recipe.image_url = data.image_url;
      const existing = card.querySelector(".ds-recipe-image");
      if (!existing) {
        const img = document.createElement("img");
        img.className = "ds-recipe-image";
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = recipe.title || "Recipe image";
        img.src = normalizeAssetUrl(data.image_url);
        card.prepend(img);
      }
    }
    void refreshLibrary();
  });

  discardBtn.addEventListener("click", () => {
    card.remove();
  });

  adaptBtn.addEventListener("click", () => {
    adaptRow.style.display = adaptRow.style.display === "none" ? "" : "none";
    if (adaptRow.style.display !== "none") adaptInput.focus();
  });

  adaptSend.addEventListener("click", async () => {
    const change = String(adaptInput.value ?? "").trim();
    if (!change) return;
    status.textContent = "Adapting…";
    startAiTelemetry("Adapting recipe", "Calling AI to revise the recipe...");
    const { response, data } = await postJson("/api/diabetic/adapt", { recipe_id: recipe.recipe_id, change });
    if (!response.ok) {
      status.textContent = data?.error || "Adapt failed";
      failTelemetry("Adapt failed", data?.error || "Request failed.");
      return;
    }
    status.textContent = "Adapted ✓";
    const next = renderRecipeCard({ recipe: data.recipe, route: data.route });
    if (next) {
      els.recipeCards.prepend(next);
      next.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    finishTelemetry("Adapted", data);
  });

  imageCreateBtn?.addEventListener("click", async () => {
    const hasImage = Boolean(String(recipe.image_url ?? "").trim());
    const ok = await confirmCreateImage(recipe, { force: hasImage });
    if (!ok) {
      status.textContent = "Image generation cancelled.";
      setTimeout(() => {
        if (status.textContent === "Image generation cancelled.") status.textContent = "";
      }, 1200);
      return;
    }
    await ensureImageForRecipe(recipe, card, status, { force: hasImage });
  });

  imageUploadBtn?.addEventListener("click", () => {
    imageUploadInput?.click();
  });

  imageUploadInput?.addEventListener("change", async () => {
    const file = imageUploadInput?.files?.[0] ?? null;
    if (!file) return;
    await uploadImageForRecipe(recipe, card, file, status);
    try {
      imageUploadInput.value = "";
    } catch {
      // ignore
    }
  });

  return card;
}

async function refreshLibrary() {
  const url = favoritesOnly
    ? (activeMealFilter ? `/api/diabetic/favorites?meal_type=${encodeURIComponent(activeMealFilter)}` : "/api/diabetic/favorites")
    : (activeMealFilter ? `/api/diabetic/recipes?meal_type=${encodeURIComponent(activeMealFilter)}` : "/api/diabetic/recipes");
  const { response, data } = await getJson(url);
  if (!response.ok) {
    els.libraryMeta.textContent = response.status === 404
      ? "Failed to load recipes (404). Restart the server on the DiabeticSpace branch."
      : `Failed to load recipes (HTTP ${response.status}).`;
    return;
  }
  const recipes = Array.isArray(data.recipes) ? data.recipes : [];
  cachedLibrary = recipes;
  const label = favoritesOnly ? "favorite" : "saved recipe";
  els.libraryMeta.textContent = `${recipes.length} ${label}${recipes.length === 1 ? "" : "s"}${activeMealFilter ? ` · ${activeMealFilter}` : ""}`;
  renderBrowseList();
}

const MEAL_PLAN_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MEAL_PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack", "dessert"];

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartFromDateString(dateString) {
  const raw = String(dateString ?? "").trim();
  const base = raw ? new Date(`${raw}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  const day = base.getDay(); // 0=Sun ... 6=Sat
  const daysSinceMonday = (day + 6) % 7;
  base.setDate(base.getDate() - daysSinceMonday);
  return formatLocalDate(base);
}

function ensureMealPlanWeekInput() {
  const current = String(els.planWeek?.value ?? "").trim();
  const weekStart = weekStartFromDateString(current || formatLocalDate(new Date()));
  if (els.planWeek) {
    els.planWeek.value = weekStart;
  }
  return weekStart;
}

function labelDay(day) {
  return String(day ?? "").slice(0, 1).toUpperCase() + String(day ?? "").slice(1);
}

function labelSlot(slot) {
  if (slot === "breakfast") return "Breakfast";
  if (slot === "lunch") return "Lunch";
  if (slot === "dinner") return "Dinner";
  if (slot === "snack") return "Snack";
  if (slot === "dessert") return "Dessert";
  return String(slot ?? "");
}

function renderMealPlan(plan) {
  if (!els.planGrid) return;
  els.planGrid.innerHTML = "";

  const items = Array.isArray(plan?.items) ? plan.items : [];
  const grouped = new Map();
  for (const day of MEAL_PLAN_DAYS) {
    for (const slot of MEAL_PLAN_SLOTS) {
      grouped.set(`${day}|${slot}`, []);
    }
  }
  for (const item of items) {
    const day = String(item.day_of_week ?? "").trim().toLowerCase();
    const slot = String(item.meal_slot ?? "").trim().toLowerCase();
    const key = `${day}|${slot}`;
    if (!grouped.has(key)) continue;
    grouped.get(key).push(item);
  }

  for (const day of MEAL_PLAN_DAYS) {
    const dayCard = document.createElement("section");
    dayCard.className = "ds-plan-day";
    dayCard.innerHTML = `<h3>${escapeHtml(labelDay(day))}</h3>`;

    for (const slot of MEAL_PLAN_SLOTS) {
      const section = document.createElement("div");
      section.className = "ds-plan-slot";
      const list = document.createElement("div");
      list.className = "ds-plan-items";

      const entries = grouped.get(`${day}|${slot}`) ?? [];
      if (entries.length === 0) {
        list.innerHTML = `<div class="ds-muted ds-plan-empty">No items</div>`;
      } else {
        for (const entry of entries) {
          const row = document.createElement("div");
          row.className = "ds-plan-item";
          const title = entry.recipe_title || entry.recipe_id || "Recipe";
          row.innerHTML = `
            <div class="ds-plan-item-title">${escapeHtml(title)}</div>
            <div class="ds-plan-item-actions">
              <button class="ghost-action move" type="button">Move</button>
              <button class="ghost-action remove" type="button">Remove</button>
            </div>
          `;

          row.querySelector("button.remove")?.addEventListener("click", async () => {
            const { response } = await postJson("/api/diabetic/meal-plan/remove", { item_id: entry.id });
            if (!response.ok) return;
            const weekStart = ensureMealPlanWeekInput();
            await loadMealPlanWeek(weekStart);
          });

          row.querySelector("button.move")?.addEventListener("click", async () => {
            const nextDay = window.prompt("Move to day (monday..sunday):", day) ?? "";
            const nextSlot = window.prompt("Move to slot (breakfast..dessert):", slot) ?? "";
            const { response } = await postJson("/api/diabetic/meal-plan/update", {
              item_id: entry.id,
              updates: { day_of_week: nextDay, meal_slot: nextSlot }
            });
            if (!response.ok) return;
            const weekStart = ensureMealPlanWeekInput();
            await loadMealPlanWeek(weekStart);
          });

          list.appendChild(row);
        }
      }

      section.innerHTML = `<h4>${escapeHtml(labelSlot(slot))}</h4>`;
      section.appendChild(list);
      dayCard.appendChild(section);
    }

    els.planGrid.appendChild(dayCard);
  }

  const hasPlan = Boolean(plan?.plan_id);
  els.planGenerateShopping?.toggleAttribute("disabled", !hasPlan);
  els.planPrint?.toggleAttribute("disabled", !hasPlan);
}

async function loadMealPlanWeek(weekStart) {
  const week = String(weekStart ?? "").trim();
  if (!week) return null;
  if (els.planHint) els.planHint.textContent = "Loading meal plan...";
  const { response, data } = await getJson(`/api/diabetic/meal-plan/week?week_start=${encodeURIComponent(week)}`);
  if (!response.ok) {
    activeMealPlanId = "";
    renderMealPlan(null);
    if (els.planHint) {
      els.planHint.textContent = response.status === 404
        ? "No meal plan for this week yet. Click Create to start one."
        : (data?.error || `Failed to load meal plan (HTTP ${response.status}).`);
    }
    return null;
  }

  activeMealPlanId = String(data?.plan?.plan_id ?? "");
  if (els.planHint) els.planHint.textContent = `Week of ${week}`;
  renderMealPlan(data.plan);
  return data.plan;
}

async function createMealPlanWeek(weekStart) {
  const week = String(weekStart ?? "").trim();
  if (!week) return null;
  if (els.planHint) els.planHint.textContent = "Creating meal plan...";
  const { response, data } = await postJson("/api/diabetic/meal-plan/create", {
    week_start: week,
    title: `Week of ${week}`,
    notes: ""
  });
  if (!response.ok) {
    if (els.planHint) els.planHint.textContent = data?.error || `Create failed (HTTP ${response.status}).`;
    return null;
  }
  activeMealPlanId = String(data?.plan?.plan_id ?? "");
  if (els.planHint) els.planHint.textContent = "Meal plan created ✓";
  renderMealPlan(data.plan);
  return data.plan;
}

async function addRecipeToCurrentPlan() {
  const weekStart = ensureMealPlanWeekInput();
  if (!activeMealPlanId) {
    if (els.planHint) els.planHint.textContent = "Create or load a plan first.";
    return;
  }
  const recipeId = String(pendingPlanRecipe?.recipe_id ?? selectedRecipeId ?? "").trim();
  if (!recipeId) {
    if (els.planHint) els.planHint.textContent = "Select a recipe first (from Search) or use Add to Plan on a recipe card.";
    return;
  }

  if (els.planHint) els.planHint.textContent = "Adding item...";
  const { response, data } = await postJson("/api/diabetic/meal-plan/add", {
    plan_id: activeMealPlanId,
    recipe_id: recipeId,
    day_of_week: String(els.planDay?.value ?? "monday"),
    meal_slot: String(els.planSlot?.value ?? "dinner"),
    servings: String(els.planServings?.value ?? "").trim(),
    notes: ""
  });
  if (!response.ok) {
    if (els.planHint) els.planHint.textContent = data?.error || `Add failed (HTTP ${response.status}).`;
    return;
  }
  if (els.planHint) els.planHint.textContent = "Added ✓";
  pendingPlanRecipe = null;
  if (els.planSelected) els.planSelected.textContent = "(none)";
  if (els.planServings) els.planServings.value = "";
  await loadMealPlanWeek(weekStart);
}

function renderShoppingSidebar() {
  if (!els.shoppingLists) return;
  els.shoppingLists.innerHTML = "";

  const lists = Array.isArray(cachedShoppingLists) ? cachedShoppingLists : [];
  if (!lists.length) {
    els.shoppingLists.innerHTML = `<div class="ds-muted">No lists yet.</div>`;
    return;
  }

  for (const list of lists) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ds-shopping-list${String(list.list_id) === String(activeShoppingListId) ? " active" : ""}`;
    button.textContent = list.title || list.list_id;
    button.addEventListener("click", () => void loadShoppingList(String(list.list_id)));
    els.shoppingLists.appendChild(button);
  }
}

async function refreshShoppingLists() {
  const { response, data } = await getJson("/api/diabetic/shopping-lists");
  if (!response.ok) {
    cachedShoppingLists = [];
    renderShoppingSidebar();
    if (els.shoppingHint) els.shoppingHint.textContent = "Failed to load shopping lists.";
    return [];
  }
  const lists = Array.isArray(data.lists) ? data.lists : [];
  cachedShoppingLists = lists;
  renderShoppingSidebar();
  return lists;
}

function renderShoppingList(list) {
  if (!els.shoppingItems || !els.shoppingTitle) return;
  els.shoppingItems.innerHTML = "";

  if (!list?.list_id) {
    els.shoppingTitle.textContent = "No list selected";
    els.shoppingPrint?.setAttribute("disabled", "");
    return;
  }

  els.shoppingTitle.textContent = list.title || "Shopping list";
  els.shoppingPrint?.toggleAttribute("disabled", false);

  const items = Array.isArray(list.items) ? list.items : [];
  if (!items.length) {
    els.shoppingItems.innerHTML = `<p class="ds-sub ds-empty">No items yet.</p>`;
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = `ds-shopping-item${Number(item.checked ?? 0) ? " checked" : ""}`;

    const labelParts = [
      String(item.amount ?? "").trim(),
      String(item.unit ?? "").trim(),
      String(item.name ?? "").trim()
    ].filter(Boolean);

    row.innerHTML = `
      <label class="ds-shopping-check">
        <input type="checkbox" ${Number(item.checked ?? 0) ? "checked" : ""} />
        <span>${escapeHtml(labelParts.join(" "))}</span>
      </label>
      <button type="button" class="ghost-action delete">Delete</button>
    `;

    row.querySelector("input")?.addEventListener("change", async (event) => {
      const checked = Boolean(event.target?.checked);
      const { response } = await postJson("/api/diabetic/shopping-list/item/check", { item_id: item.id, checked: checked ? 1 : 0 });
      if (response.ok) {
        await loadShoppingList(activeShoppingListId);
      }
    });

    row.querySelector("button.delete")?.addEventListener("click", async () => {
      const { response } = await postJson("/api/diabetic/shopping-list/item/delete", { item_id: item.id });
      if (response.ok) {
        await loadShoppingList(activeShoppingListId);
      }
    });

    els.shoppingItems.appendChild(row);
  }
}

async function loadShoppingList(listId) {
  const id = String(listId ?? "").trim();
  if (!id) return null;
  activeShoppingListId = id;
  renderShoppingSidebar();

  if (els.shoppingHint) els.shoppingHint.textContent = "Loading shopping list...";
  const { response, data } = await getJson(`/api/diabetic/shopping-list?list_id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    renderShoppingList(null);
    if (els.shoppingHint) els.shoppingHint.textContent = data?.error || `Failed to load list (HTTP ${response.status}).`;
    return null;
  }
  if (els.shoppingHint) els.shoppingHint.textContent = "";
  renderShoppingList(data.list);
  return data.list;
}

async function createNewShoppingList() {
  const title = window.prompt("Shopping list title:", `Shopping list ${new Date().toLocaleDateString()}`) ?? "";
  const trimmed = String(title).trim();
  if (!trimmed) return;

  if (els.shoppingHint) els.shoppingHint.textContent = "Creating list...";
  const { response, data } = await postJson("/api/diabetic/shopping-list/create", { title: trimmed });
  if (!response.ok) {
    if (els.shoppingHint) els.shoppingHint.textContent = data?.error || "Create failed.";
    return;
  }

  await refreshShoppingLists();
  await loadShoppingList(data.list?.list_id);
}

async function addManualShoppingItem() {
  const name = String(els.shoppingItemName?.value ?? "").trim();
  if (!name) return;
  if (!activeShoppingListId) {
    if (els.shoppingHint) els.shoppingHint.textContent = "Select or create a list first.";
    return;
  }

  const amount = String(els.shoppingItemAmount?.value ?? "").trim();
  const unit = String(els.shoppingItemUnit?.value ?? "").trim();
  const { response, data } = await postJson("/api/diabetic/shopping-list/item/add", {
    list_id: activeShoppingListId,
    item: { name, amount, unit }
  });
  if (!response.ok) {
    if (els.shoppingHint) els.shoppingHint.textContent = data?.error || "Add failed.";
    return;
  }

  if (els.shoppingItemName) els.shoppingItemName.value = "";
  if (els.shoppingItemAmount) els.shoppingItemAmount.value = "";
  if (els.shoppingItemUnit) els.shoppingItemUnit.value = "";
  await loadShoppingList(activeShoppingListId);
}

async function generateShoppingFromCurrentPlan() {
  if (!activeMealPlanId) {
    if (els.planHint) els.planHint.textContent = "Load a meal plan first.";
    return;
  }
  if (els.planHint) els.planHint.textContent = "Generating shopping list...";
  const { response, data } = await postJson("/api/diabetic/shopping-list/from-meal-plan", { plan_id: activeMealPlanId });
  if (!response.ok) {
    if (els.planHint) els.planHint.textContent = data?.error || "Generate failed.";
    return;
  }
  if (els.planHint) els.planHint.textContent = "Shopping list ready ✓";
  await refreshShoppingLists();
  setMode("shopping");
  await loadShoppingList(data.list?.list_id);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportRecipeSharePackage(recipe, statusEl) {
  if (!recipe?.recipe_id) return;
  const recipeId = String(recipe.recipe_id).trim();
  if (!recipeId) return;
  const notes = window.prompt("Notes for this recipe card (optional):", "") ?? "";
  const authorName = window.prompt("Author name (optional):", String(recipe.author_name ?? "").trim()) ?? "";
  const params = new URLSearchParams({ recipe_id: recipeId });
  if (String(notes).trim()) params.set("notes", String(notes).trim());
  if (String(authorName).trim()) params.set("author_name", String(authorName).trim());

  if (statusEl) statusEl.textContent = "Preparing share card...";
  const response = await fetch(`/api/diabetic/share/recipe?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (statusEl) statusEl.textContent = payload?.error || `Share export failed (HTTP ${response.status}).`;
    return;
  }

  const pkg = payload.package ?? payload;
  const stamped = String(pkg.created_at ?? new Date().toISOString()).slice(0, 19).replaceAll(":", "-");
  downloadJson(`diabeticspace-recipe-share-${recipeId}-${stamped}.json`, pkg);
  if (statusEl) {
    statusEl.textContent = "Share card exported ✓";
    setTimeout(() => {
      if (statusEl.textContent === "Share card exported ✓") statusEl.textContent = "";
    }, 1600);
  }
}

async function exportBackup() {
  if (!els.settingsImportStatus) return;
  els.settingsImportStatus.textContent = "Exporting backup...";
  const response = await fetch("/api/diabetic/export");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    els.settingsImportStatus.textContent = payload?.error || `Export failed (HTTP ${response.status}).`;
    return;
  }
  const stamped = String(payload.exported_at ?? new Date().toISOString()).slice(0, 19).replaceAll(":", "-");
  downloadJson(`diabeticspace-backup-${stamped}.json`, payload);
  els.settingsImportStatus.textContent = "Exported ✓";
}

async function previewImport(backup) {
  if (!els.settingsImportPreview || !els.settingsImportStatus) return;
  els.settingsImportStatus.textContent = "Previewing import (dry run)...";
  const { response, data } = await postJson("/api/diabetic/import", { backup, dry_run: true, overwrite: false });
  if (!response.ok) {
    els.settingsImportStatus.textContent = data?.error || `Preview failed (HTTP ${response.status}).`;
    els.settingsImportPreview.textContent = "";
    return;
  }
  els.settingsImportStatus.textContent = "Preview ready.";
  els.settingsImportPreview.textContent = JSON.stringify(data.summary, null, 2);
  els.settingsImportApply?.toggleAttribute("disabled", false);
}

async function handleImportFile(file) {
  if (!file) return;
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    els.settingsImportStatus.textContent = "Invalid JSON file.";
    return;
  }
  pendingImportBackup = parsed;
  await previewImport(parsed);
}

async function applyImport() {
  if (!pendingImportBackup) return;
  const overwrite = Boolean(els.settingsImportOverwrite?.checked);
  els.settingsImportStatus.textContent = overwrite ? "Importing (overwrite)..." : "Importing...";
  const { response, data } = await postJson("/api/diabetic/import", { backup: pendingImportBackup, dry_run: false, overwrite });
  if (!response.ok) {
    els.settingsImportStatus.textContent = data?.error || `Import failed (HTTP ${response.status}).`;
    return;
  }
  els.settingsImportStatus.textContent = "Imported ✓";
  els.settingsImportPreview.textContent = JSON.stringify(data.summary, null, 2);
  pendingImportBackup = null;
  els.settingsImportApply?.setAttribute("disabled", "");
  await refreshLibrary();
  await refreshShoppingLists();
}

async function refreshProviderSettings() {
  if (!els.settingsProviderStatus) return;
  const providerId = String(els.settingsProvider?.value ?? "openai").trim() || "openai";
  const def = PROVIDER_DEFS[providerId] ?? PROVIDER_DEFS.openai;

  const toggle = (el, show) => {
    if (!el) return;
    el.style.display = show ? "" : "none";
  };

  toggle(els.settingsProviderApiKey, Boolean(def.fields.api_key));
  toggle(els.settingsProviderClear, Boolean(def.fields.api_key));
  toggle(els.settingsProviderBaseUrl, Boolean(def.fields.base_url));
  toggle(els.settingsProviderModel, Boolean(def.fields.model));
  toggle(els.settingsProviderImageModel, Boolean(def.fields.image_model));

  if (providerId === "none") {
    if (els.settingsProviderApiKey) els.settingsProviderApiKey.value = "";
    if (els.settingsProviderBaseUrl) els.settingsProviderBaseUrl.value = "";
    if (els.settingsProviderModel) els.settingsProviderModel.value = "";
    if (els.settingsProviderImageModel) els.settingsProviderImageModel.value = "";
    els.settingsProviderStatus.textContent = "AI disabled. Local-only mode.";
    return;
  }

  els.settingsProviderStatus.textContent = "Loading provider settings...";

  const { response, data } = await getJson(`/api/diabetic/provider-settings?provider_id=${encodeURIComponent(providerId)}`);
  if (!response.ok) {
    els.settingsProviderStatus.textContent = data?.error || `Failed to load settings (HTTP ${response.status}).`;
    return;
  }

  const settings = Array.isArray(data.settings) ? data.settings : [];
  const meta = data.meta ?? {};
  const apiKeyRow = settings.find((row) => row.key === "api_key") ?? null;
  const baseUrlRow = settings.find((row) => row.key === "base_url") ?? null;
  const modelRow = settings.find((row) => row.key === "model") ?? null;
  const imageModelRow = settings.find((row) => row.key === "image_model") ?? null;
  const defaults = def.defaults ?? {};

  const envHasKey = Boolean(meta?.env?.api_key);
  const savedHasKey = Boolean(apiKeyRow?.has_value);

  if (els.settingsProviderApiKey) {
    els.settingsProviderApiKey.value = "";
  }
  if (els.settingsProviderBaseUrl) {
    els.settingsProviderBaseUrl.value = String(baseUrlRow?.value ?? "");
    const defaultBaseUrl = String(defaults.base_url ?? "").trim();
    els.settingsProviderBaseUrl.placeholder = meta?.env?.base_url
      ? `Env: ${meta.env.base_url}`
      : defaultBaseUrl
        ? `Default: ${defaultBaseUrl}`
        : "Base URL (optional)";
  }
  if (els.settingsProviderModel) {
    els.settingsProviderModel.value = String(modelRow?.value ?? "");
    const defaultModel = String(defaults.model ?? "").trim();
    els.settingsProviderModel.placeholder = meta?.env?.model
      ? `Env: ${meta.env.model}`
      : defaultModel
        ? `Default: ${defaultModel}`
        : "Model (optional)";
  }
  if (els.settingsProviderImageModel) {
    els.settingsProviderImageModel.value = String(imageModelRow?.value ?? "");
    const defaultImageModel = String(defaults.image_model ?? "").trim();
    els.settingsProviderImageModel.placeholder = meta?.env?.image_model
      ? `Env: ${meta.env.image_model}`
      : defaultImageModel
        ? `Default: ${defaultImageModel}`
        : "Image model (optional)";
  }

  const keySource = envHasKey ? "environment" : savedHasKey ? "saved locally" : "not set";
  const label = def.label || providerId;
  if (def.fields.api_key) {
    els.settingsProviderStatus.textContent = `${label} key: ${keySource}.`;
  } else {
    const envBaseUrl = String(meta?.env?.base_url ?? "").trim();
    const savedBaseUrl = String(baseUrlRow?.value ?? "").trim();
    const baseUrl = envBaseUrl || savedBaseUrl || "";
    els.settingsProviderStatus.textContent = `${label}${baseUrl ? ` • ${baseUrl}` : ""}`;
  }
}

async function saveProviderSettings() {
  if (!els.settingsProviderStatus) return;
  const providerId = String(els.settingsProvider?.value ?? "openai").trim() || "openai";
  if (providerId === "none") {
    els.settingsProviderStatus.textContent = "Nothing to save for Disabled provider.";
    return;
  }
  const def = PROVIDER_DEFS[providerId] ?? PROVIDER_DEFS.openai;
  const apiKey = String(els.settingsProviderApiKey?.value ?? "").trim();
  const baseUrl = String(els.settingsProviderBaseUrl?.value ?? "").trim();
  const model = String(els.settingsProviderModel?.value ?? "").trim();
  const imageModel = String(els.settingsProviderImageModel?.value ?? "").trim();

  els.settingsProviderStatus.textContent = "Saving settings...";

  const saves = [];
  if (def.fields.api_key && apiKey) {
    saves.push(postJson("/api/diabetic/provider-settings", { provider_id: providerId, key: "api_key", value: apiKey }));
  }
  if (def.fields.base_url && baseUrl) {
    saves.push(postJson("/api/diabetic/provider-settings", { provider_id: providerId, key: "base_url", value: baseUrl }));
  }
  if (def.fields.model && model) {
    saves.push(postJson("/api/diabetic/provider-settings", { provider_id: providerId, key: "model", value: model }));
  }
  if (def.fields.image_model && imageModel) {
    saves.push(postJson("/api/diabetic/provider-settings", { provider_id: providerId, key: "image_model", value: imageModel }));
  }

  if (!saves.length) {
    els.settingsProviderStatus.textContent = "Nothing to save.";
    return;
  }

  const results = await Promise.all(saves);
  const failed = results.find((r) => !r.response?.ok);
  if (failed) {
    els.settingsProviderStatus.textContent = failed.data?.error || "Save failed.";
    return;
  }

  if (els.settingsProviderApiKey) els.settingsProviderApiKey.value = "";
  els.settingsProviderStatus.textContent = "Saved ✓";
  setTimeout(() => {
    if (els.settingsProviderStatus.textContent === "Saved ✓") els.settingsProviderStatus.textContent = "";
  }, 1200);
  await refreshProviderSettings();
}

async function clearProviderKey() {
  const providerId = String(els.settingsProvider?.value ?? "openai").trim() || "openai";
  const def = PROVIDER_DEFS[providerId] ?? PROVIDER_DEFS.openai;
  if (!def.fields.api_key) {
    if (els.settingsProviderStatus) els.settingsProviderStatus.textContent = "This provider does not use an API key.";
    return;
  }
  const ok = window.confirm("Clear the saved API key for this provider? (Environment variables will still work.)");
  if (!ok) return;
  if (els.settingsProviderStatus) els.settingsProviderStatus.textContent = "Clearing saved key...";
  const { response, data } = await postJson("/api/diabetic/provider-settings", { provider_id: providerId, key: "api_key", value: "" });
  if (!response.ok) {
    if (els.settingsProviderStatus) els.settingsProviderStatus.textContent = data?.error || "Clear failed.";
    return;
  }
  if (els.settingsProviderStatus) els.settingsProviderStatus.textContent = "Cleared ✓";
  await refreshProviderSettings();
}

async function refreshActiveProviders() {
  if (!els.settingsActiveProviderStatus) return;
  els.settingsActiveProviderStatus.textContent = "Loading active providers...";
  const { response, data } = await getJson("/api/diabetic/provider-settings?provider_id=app");
  if (!response.ok) {
    els.settingsActiveProviderStatus.textContent = data?.error || `Failed to load active providers (HTTP ${response.status}).`;
    return;
  }

  const settings = Array.isArray(data.settings) ? data.settings : [];
  const textRow = settings.find((row) => row.key === "active_text_provider") ?? null;
  const imageRow = settings.find((row) => row.key === "active_image_provider") ?? null;

  const selectedText = String(textRow?.value ?? "openai").trim() || "openai";
  const selectedImage = String(imageRow?.value ?? "openai").trim() || "openai";

  const textProvider = PROVIDER_DEFS[selectedText]?.supports?.text ? selectedText : "openai";
  const imageProvider = selectedImage === "none"
    ? "none"
    : PROVIDER_DEFS[selectedImage]?.supports?.image
      ? selectedImage
      : "openai";

  if (els.settingsActiveTextProvider) els.settingsActiveTextProvider.value = textProvider;
  if (els.settingsActiveImageProvider) els.settingsActiveImageProvider.value = imageProvider;

  const textLabel = PROVIDER_DEFS[textProvider]?.label ?? textProvider;
  const imageLabel = imageProvider === "none" ? "Disabled" : (PROVIDER_DEFS[imageProvider]?.label ?? imageProvider);

  // If a profile is active it overrides the per-provider active selection on
  // the server. Show that so the user isn't confused why the dropdown above
  // doesn't match what's actually being used.
  let suffix = "";
  if (cachedActiveProfileId) {
    const active = cachedProfiles.find((p) => p.profile_id === cachedActiveProfileId);
    if (active) {
      const providerLabel = PROVIDER_DEFS[active.provider_id]?.label ?? active.provider_id;
      suffix = ` • Profile in use: ${active.label} (${providerLabel})`;
    }
  }
  els.settingsActiveProviderStatus.textContent = `Active text: ${textLabel} • Active images: ${imageLabel}${suffix}`;
}

async function saveActiveProviders() {
  if (!els.settingsActiveProviderStatus) return;
  const textProvider = String(els.settingsActiveTextProvider?.value ?? "openai").trim() || "openai";
  const imageProvider = String(els.settingsActiveImageProvider?.value ?? "openai").trim() || "openai";

  els.settingsActiveProviderStatus.textContent = "Saving active providers...";
  const results = await Promise.all([
    postJson("/api/diabetic/provider-settings", { provider_id: "app", key: "active_text_provider", value: textProvider }),
    postJson("/api/diabetic/provider-settings", { provider_id: "app", key: "active_image_provider", value: imageProvider })
  ]);

  const failed = results.find((r) => !r.response?.ok);
  if (failed) {
    els.settingsActiveProviderStatus.textContent = failed.data?.error || "Failed to save active providers.";
    return;
  }

  els.settingsActiveProviderStatus.textContent = "Saved ✓";
  setTimeout(() => {
    if (els.settingsActiveProviderStatus.textContent === "Saved ✓") els.settingsActiveProviderStatus.textContent = "";
  }, 900);
  await refreshActiveProviders();
}

// ---------------------------------------------------------------------------
// Profiles (multi-config switching)
// ---------------------------------------------------------------------------
async function refreshProfiles() {
  if (!els.settingsProfileSelect) return;
  const { response, data } = await getJson("/api/diabetic/profiles");
  if (!response?.ok) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = data?.error || "Failed to load profiles.";
    return;
  }
  cachedProfiles = Array.isArray(data.profiles) ? data.profiles : [];
  cachedActiveProfileId = String(data.active_profile_id ?? "").trim();

  const previousValue = els.settingsProfileSelect.value;
  els.settingsProfileSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = cachedProfiles.length ? "— Pick a profile —" : "— No saved profiles —";
  els.settingsProfileSelect.appendChild(placeholder);

  for (const profile of cachedProfiles) {
    const option = document.createElement("option");
    option.value = profile.profile_id;
    const providerLabel = PROVIDER_DEFS[profile.provider_id]?.label ?? profile.provider_id;
    const isActive = profile.profile_id === cachedActiveProfileId;
    option.textContent = `${profile.label} • ${providerLabel}${profile.model ? ` (${profile.model})` : ""}${isActive ? " ✓ active" : ""}`;
    els.settingsProfileSelect.appendChild(option);
  }
  els.settingsProfileSelect.value = previousValue && cachedProfiles.some((p) => p.profile_id === previousValue)
    ? previousValue
    : cachedActiveProfileId || "";

  if (els.settingsProfileStatus) {
    if (cachedActiveProfileId) {
      const active = cachedProfiles.find((p) => p.profile_id === cachedActiveProfileId);
      els.settingsProfileStatus.textContent = active
        ? `Active profile: ${active.label} (${PROVIDER_DEFS[active.provider_id]?.label ?? active.provider_id})`
        : "Active profile id is set, but profile is missing.";
    } else {
      els.settingsProfileStatus.textContent = cachedProfiles.length
        ? "No profile is active — falling back to per-provider defaults."
        : "No profiles yet. Add one below.";
    }
  }
}

async function saveProfile() {
  if (!els.settingsProfileStatus) return;
  const label = String(els.settingsProfileLabel?.value ?? "").trim();
  const provider_id = String(els.settingsProfileProvider?.value ?? "").trim();
  if (!label) {
    els.settingsProfileStatus.textContent = "Profile label is required.";
    return;
  }
  if (!provider_id) {
    els.settingsProfileStatus.textContent = "Pick a provider.";
    return;
  }

  els.settingsProfileStatus.textContent = "Saving profile...";
  const { response, data } = await postJson("/api/diabetic/profiles", {
    label,
    provider_id,
    api_key: String(els.settingsProfileApiKey?.value ?? "").trim(),
    base_url: String(els.settingsProfileBaseUrl?.value ?? "").trim(),
    model: String(els.settingsProfileModel?.value ?? "").trim(),
    set_active: Boolean(els.settingsProfileSetActive?.checked)
  });
  if (!response?.ok) {
    els.settingsProfileStatus.textContent = data?.error || `Save failed (HTTP ${response?.status}).`;
    return;
  }

  if (els.settingsProfileLabel) els.settingsProfileLabel.value = "";
  if (els.settingsProfileApiKey) els.settingsProfileApiKey.value = "";
  if (els.settingsProfileBaseUrl) els.settingsProfileBaseUrl.value = "";
  if (els.settingsProfileModel) els.settingsProfileModel.value = "";

  els.settingsProfileStatus.textContent = "Saved ✓";
  await refreshProfiles();
  await refreshActiveProviders();
}

async function activateSelectedProfile() {
  const profileId = String(els.settingsProfileSelect?.value ?? "").trim();
  if (!profileId) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Pick a profile to activate.";
    return;
  }
  if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Activating profile...";
  const { response, data } = await postJson("/api/diabetic/profiles/active", { profile_id: profileId });
  if (!response?.ok) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = data?.error || "Failed to activate profile.";
    return;
  }
  await refreshProfiles();
  await refreshActiveProviders();
}

async function clearActiveProfile() {
  if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Clearing active profile...";
  const { response, data } = await postJson("/api/diabetic/profiles/active", { profile_id: "" });
  if (!response?.ok) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = data?.error || "Failed.";
    return;
  }
  await refreshProfiles();
  await refreshActiveProviders();
}

async function deleteSelectedProfile() {
  const profileId = String(els.settingsProfileSelect?.value ?? "").trim();
  if (!profileId) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Pick a profile to delete.";
    return;
  }
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    if (!window.confirm("Delete this profile? This will remove its saved API key.")) return;
  }
  if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Deleting...";
  const response = await fetch(`/api/diabetic/profiles?profile_id=${encodeURIComponent(profileId)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = data?.error || `Delete failed (HTTP ${response.status}).`;
    return;
  }
  if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Deleted ✓";
  await refreshProfiles();
  await refreshActiveProviders();
}

async function testProfileConnection() {
  const profileId = String(els.settingsProfileSelect?.value ?? "").trim();
  if (els.settingsProfileStatus) els.settingsProfileStatus.textContent = "Testing connection...";

  // If a profile is selected, test it server-side. Otherwise build a draft
  // payload from the form fields so the user can test before saving.
  const draftLabel = String(els.settingsProfileLabel?.value ?? "").trim();
  const useSelected = profileId && !draftLabel;

  const body = useSelected
    ? { profile_id: profileId }
    : {
        provider_id: String(els.settingsProfileProvider?.value ?? "").trim(),
        api_key: String(els.settingsProfileApiKey?.value ?? "").trim(),
        base_url: String(els.settingsProfileBaseUrl?.value ?? "").trim(),
        model: String(els.settingsProfileModel?.value ?? "").trim()
      };

  const { response, data } = await postJson("/api/diabetic/provider-test", body);
  if (response?.ok && data?.ok) {
    els.settingsProfileStatus.textContent = `OK in ${formatMilliseconds(data.latencyMs)} • ${data.model || "(model not reported)"}`;
  } else {
    els.settingsProfileStatus.textContent = `Test failed: ${data?.error || `HTTP ${response?.status}`}`;
  }
}

// Test connection for the per-provider-defaults card.
async function testProviderDefaults() {
  if (!els.settingsProviderTestStatus) return;
  const providerId = String(els.settingsProvider?.value ?? "openai").trim() || "openai";
  if (providerId === "none") {
    els.settingsProviderTestStatus.textContent = "Pick a provider before testing.";
    return;
  }
  els.settingsProviderTestStatus.textContent = "Testing connection...";
  const body = {
    provider_id: providerId,
    api_key: String(els.settingsProviderApiKey?.value ?? "").trim(),
    base_url: String(els.settingsProviderBaseUrl?.value ?? "").trim(),
    model: String(els.settingsProviderModel?.value ?? "").trim()
  };
  const { response, data } = await postJson("/api/diabetic/provider-test", body);
  if (response?.ok && data?.ok) {
    els.settingsProviderTestStatus.textContent = `OK in ${formatMilliseconds(data.latencyMs)} • ${data.model || "(model not reported)"}`;
  } else {
    els.settingsProviderTestStatus.textContent = `Test failed: ${data?.error || `HTTP ${response?.status}`}`;
  }
}

async function runProviderTestAndUpdateUI({ body, statusEl, modelEl, modelsEl, imageModelEl, imageModelsEl }) {
  if (!statusEl) return;
  statusEl.textContent = "Testing connection...";

  const { response, data } = await postJson("/api/diabetic/provider-test", body);
  const ok = Boolean(response?.ok && data?.ok);

  const models = Array.isArray(data?.models) ? data.models : [];
  if (modelsEl && models.length) populateModelDatalist(modelsEl, models);

  const imageModels = Array.isArray(data?.image_models) ? data.image_models : [];
  if (imageModelsEl && imageModels.length) populateModelDatalist(imageModelsEl, imageModels);

  const suggested = String(data?.suggested_model ?? data?.suggestedModel ?? "").trim();
  let appliedSuggestion = false;
  if (suggested && modelEl) {
    const current = String(modelEl.value ?? "").trim();
    const currentLower = current.toLowerCase();
    const currentValid = current && models.includes(current);
    if (!current || currentLower === "grok" || (!currentValid && models.length)) {
      modelEl.value = suggested;
      appliedSuggestion = true;
    }
  }

  const suggestedImage = String(data?.suggested_image_model ?? "").trim();
  if (suggestedImage && imageModelEl) {
    const current = String(imageModelEl.value ?? "").trim();
    const currentValid = current && imageModels.includes(current);
    if (!current || (!currentValid && imageModels.length)) {
      imageModelEl.value = suggestedImage;
    }
  }

  const modelLabel = String(data?.model ?? "").trim() || (suggested ? suggested : "(model not reported)");
  const modelsSummary = models.length
    ? ` • Models: ${models.length} (${summarizeModelList(models)})`
    : data?.models_error
      ? ` • Models: ${String(data.models_error)}`
      : "";
  const suggestionSummary = suggested
    ? ` • Suggested: ${suggested}${appliedSuggestion ? " (applied)" : ""}`
    : "";

  if (ok) {
    statusEl.textContent = `OK in ${formatMilliseconds(data.latencyMs)} • ${modelLabel}${modelsSummary}${suggestionSummary}`;
  } else {
    statusEl.textContent = `Test failed: ${data?.error || `HTTP ${response?.status}`}${modelsSummary}${suggestionSummary}`;
  }
}

async function testProfileConnectionEnhanced() {
  const profileId = String(els.settingsProfileSelect?.value ?? "").trim();
  if (!els.settingsProfileStatus) return;

  const draftLabel = String(els.settingsProfileLabel?.value ?? "").trim();
  const useSelected = profileId && !draftLabel;

  const body = useSelected
    ? { profile_id: profileId }
    : {
        provider_id: String(els.settingsProfileProvider?.value ?? "").trim(),
        api_key: String(els.settingsProfileApiKey?.value ?? "").trim(),
        base_url: String(els.settingsProfileBaseUrl?.value ?? "").trim(),
        model: String(els.settingsProfileModel?.value ?? "").trim()
      };

  await runProviderTestAndUpdateUI({
    body,
    statusEl: els.settingsProfileStatus,
    modelEl: els.settingsProfileModel,
    modelsEl: els.settingsProfileModels
  });
}

async function testProviderDefaultsEnhanced() {
  if (!els.settingsProviderTestStatus) return;
  const providerId = String(els.settingsProvider?.value ?? "openai").trim() || "openai";
  if (providerId === "none") {
    els.settingsProviderTestStatus.textContent = "Pick a provider before testing.";
    return;
  }

  const body = {
    provider_id: providerId,
    api_key: String(els.settingsProviderApiKey?.value ?? "").trim(),
    base_url: String(els.settingsProviderBaseUrl?.value ?? "").trim(),
    model: String(els.settingsProviderModel?.value ?? "").trim(),
    image_model: String(els.settingsProviderImageModel?.value ?? "").trim()
  };

  await runProviderTestAndUpdateUI({
    body,
    statusEl: els.settingsProviderTestStatus,
    modelEl: els.settingsProviderModel,
    modelsEl: els.settingsProviderModels,
    imageModelEl: els.settingsProviderImageModel,
    imageModelsEl: els.settingsProviderImageModels
  });
}

async function previewShareImport(packageJson) {
  if (!els.settingsSharePreview || !els.settingsShareStatus) return;
  const recipe = packageJson?.recipe ?? null;
  const title = String(recipe?.title ?? "").trim();
  const recipeId = String(recipe?.recipe_id ?? "").trim();
  const author = String(packageJson?.author_name ?? recipe?.author_name ?? "").trim();
  const license = String(recipe?.license_note ?? "").trim();

  els.settingsShareStatus.textContent = "Ready to import.";
  els.settingsSharePreview.textContent = JSON.stringify({
    app: packageJson?.app,
    type: packageJson?.type,
    version: packageJson?.version,
    recipe_id: recipeId || null,
    title: title || null,
    author_name: author || null,
    license_note: license || null
  }, null, 2);
  els.settingsShareImport?.toggleAttribute("disabled", false);
}

async function handleShareFile(file) {
  if (!file) return;
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (els.settingsShareStatus) els.settingsShareStatus.textContent = "Invalid JSON file.";
    return;
  }
  pendingSharePackage = parsed;
  await previewShareImport(parsed);
}

async function applyShareImport() {
  if (!pendingSharePackage) return;
  const overwrite = Boolean(els.settingsShareOverwrite?.checked);
  if (els.settingsShareStatus) els.settingsShareStatus.textContent = overwrite ? "Importing (overwrite)..." : "Importing...";
  const { response, data } = await postJson("/api/diabetic/share/import", { packageJson: pendingSharePackage, overwrite });
  if (!response.ok) {
    if (els.settingsShareStatus) els.settingsShareStatus.textContent = data?.error || `Import failed (HTTP ${response.status}).`;
    return;
  }
  if (els.settingsShareStatus) {
    const label = data?.duplicated ? `Imported ✓ (saved as ${data.imported_as})` : "Imported ✓";
    els.settingsShareStatus.textContent = label;
  }
  if (els.settingsSharePreview) els.settingsSharePreview.textContent = JSON.stringify(data, null, 2);
  pendingSharePackage = null;
  els.settingsShareImport?.setAttribute("disabled", "");
  await refreshLibrary();
}

const ACTIVE_USER_STORAGE_KEY = "diabeticspace.active_user_id";
let cachedUsers = [];

function getActiveUserId() {
  try {
    return String(localStorage.getItem(ACTIVE_USER_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function setActiveUserId(userId) {
  const id = String(userId ?? "").trim();
  try {
    if (id) localStorage.setItem(ACTIVE_USER_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function renderUserSelect(users) {
  if (!els.settingsUserSelect) return;
  els.settingsUserSelect.innerHTML = "";
  for (const user of users) {
    const option = document.createElement("option");
    option.value = user.user_id;
    option.textContent = user.display_name || user.user_id;
    els.settingsUserSelect.appendChild(option);
  }
}

async function refreshUsers() {
  if (!els.settingsUserStatus) return [];
  els.settingsUserStatus.textContent = "Loading profiles...";
  const { response, data } = await getJson("/api/diabetic/users");
  if (!response.ok) {
    els.settingsUserStatus.textContent = data?.error || `Failed to load profiles (HTTP ${response.status}).`;
    cachedUsers = [];
    renderUserSelect([]);
    return [];
  }

  const users = Array.isArray(data.users) ? data.users : [];
  cachedUsers = users;
  renderUserSelect(users);

  if (!users.length) {
    if (els.settingsUserCurrent) els.settingsUserCurrent.textContent = "No profile yet. Create one below.";
    els.settingsUserStatus.textContent = "";
    setActiveUserId("");
    els.settingsPinLock?.toggleAttribute("disabled", true);
    return [];
  }

  const active = getActiveUserId();
  const fallback = users[0]?.user_id ?? "";
  const selected = users.some((u) => u.user_id === active) ? active : fallback;
  if (selected && selected !== active) setActiveUserId(selected);

  if (els.settingsUserSelect) {
    els.settingsUserSelect.value = selected;
  }

  const activeUser = users.find((u) => u.user_id === selected) ?? null;
  if (els.settingsUserCurrent) {
    els.settingsUserCurrent.textContent = activeUser ? `Current: ${activeUser.display_name}` : "Current: (unknown)";
  }

  els.settingsUserStatus.textContent = "";
  await refreshPinLockSetting();
  return users;
}

async function refreshPinLockSetting() {
  const userId = getActiveUserId();
  if (!userId || !els.settingsPinLock) return;
  const { response, data } = await getJson(`/api/diabetic/settings?user_id=${encodeURIComponent(userId)}&key=pin_lock_enabled`);
  if (!response.ok) return;
  const enabled = String(data.value ?? "").trim() === "1";
  els.settingsPinLock.checked = enabled;
  els.settingsPinLock.toggleAttribute("disabled", false);
}

async function setPinLockSetting(enabled) {
  const userId = getActiveUserId();
  if (!userId) return;
  const { response, data } = await postJson("/api/diabetic/settings", {
    user_id: userId,
    key: "pin_lock_enabled",
    value: enabled ? "1" : "0"
  });
  if (!response.ok) {
    if (els.settingsUserStatus) els.settingsUserStatus.textContent = data?.error || "Failed to save setting.";
    return;
  }
  if (els.settingsUserStatus) {
    els.settingsUserStatus.textContent = "Saved ✓";
    setTimeout(() => {
      if (els.settingsUserStatus.textContent === "Saved ✓") els.settingsUserStatus.textContent = "";
    }, 1200);
  }
}

async function createProfile() {
  if (!els.settingsUserName || !els.settingsUserStatus) return;
  const displayName = String(els.settingsUserName.value ?? "").trim();
  if (!displayName) {
    els.settingsUserStatus.textContent = "Enter a display name.";
    return;
  }
  const pin = String(els.settingsUserPin?.value ?? "").trim();
  els.settingsUserStatus.textContent = "Creating profile...";
  const { response, data } = await postJson("/api/diabetic/user/create", { display_name: displayName, pin: pin || null });
  if (!response.ok) {
    els.settingsUserStatus.textContent = data?.error || "Create failed.";
    return;
  }
  const userId = String(data?.user?.user_id ?? "").trim();
  if (userId) setActiveUserId(userId);
  els.settingsUserName.value = "";
  if (els.settingsUserPin) els.settingsUserPin.value = "";
  if (els.settingsUserPinVerify) els.settingsUserPinVerify.value = "";
  await refreshUsers();
  els.settingsUserStatus.textContent = "Profile created ✓";
  setTimeout(() => {
    if (els.settingsUserStatus.textContent === "Profile created ✓") els.settingsUserStatus.textContent = "";
  }, 1400);
}

async function verifyPin() {
  if (!els.settingsUserStatus) return;
  const userId = getActiveUserId();
  if (!userId) {
    els.settingsUserStatus.textContent = "Create or select a profile first.";
    return;
  }
  const pin = String(els.settingsUserPinVerify?.value ?? "").trim();
  if (!pin) {
    els.settingsUserStatus.textContent = "Enter a PIN to verify.";
    return;
  }
  els.settingsUserStatus.textContent = "Verifying PIN...";
  const { response, data } = await postJson("/api/diabetic/user/verify-pin", { user_id: userId, pin });
  if (!response.ok) {
    els.settingsUserStatus.textContent = data?.error || "Verify failed.";
    return;
  }
  els.settingsUserStatus.textContent = data.verified ? "PIN verified ✓" : "Wrong PIN.";
}

function updateSearchVisibility() {
  const hasSelection = Boolean(selectedRecipeId);

  if (els.selectedBlock) {
    els.selectedBlock.style.display = hasSelection ? "" : "none";
  }

  if (els.browseBlock) {
    els.browseBlock.style.display = hasSelection ? "none" : "";
  }

  if (els.matchesBlock) {
    els.matchesBlock.style.display = hasSelection ? "none" : "";
  }

  if (els.aiBlock) {
    els.aiBlock.style.display = hasSelection ? "none" : els.aiBlock.style.display;
  }
}

function renderBrowseList() {
  if (!els.browseList) return;
  updateSearchVisibility();
  els.browseList.innerHTML = "";

  const mealLabel = activeMealFilter ? activeMealFilter : "all";
  if (els.browseTitle) {
    const base = favoritesOnly ? "Favorites" : "Saved recipes";
    els.browseTitle.textContent = `${base} (${mealLabel})`;
  }

  if (!Array.isArray(cachedLibrary) || cachedLibrary.length === 0) {
    if (els.browseEmpty) els.browseEmpty.style.display = "";
    return;
  }
  if (els.browseEmpty) els.browseEmpty.style.display = "none";

  for (const recipe of cachedLibrary) {
    const match = {
      recipe_id: String(recipe.recipe_id ?? ""),
      title: String(recipe.title ?? ""),
      meal_type: String(recipe.meal_type ?? "") || null,
      description: null,
      servings: recipe.servings ?? null,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      gi_notes: null,
      recall_count: 0,
      match_score: null
    };
    const item = renderMatchCard(match);
    if (item) els.browseList.appendChild(item);
  }
}

function clearSelectedRecipe() {
  selectedRecipeId = "";
  if (els.selectedRecipe) {
    els.selectedRecipe.innerHTML = "";
  }
  updateSearchVisibility();
}

function selectRecipeCard(recipe, { route = "local_recall", statusText = "" } = {}) {
  if (!recipe?.recipe_id) return;
  selectedRecipeId = String(recipe.recipe_id);
  if (els.selectedRecipe) {
    els.selectedRecipe.innerHTML = "";
    const card = renderRecipeCard({ recipe, route, statusText });
    if (card) {
      els.selectedRecipe.appendChild(card);
      const discardBtn = card.querySelector("button.discard");
      if (discardBtn) {
        discardBtn.addEventListener("click", () => {
          selectedRecipeId = "";
          updateSearchVisibility();
          renderBrowseList();
        }, { once: true });
      }
    }
  }
  updateSearchVisibility();
  els.selectedBlock?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

async function selectRecipeById(recipeId) {
  const id = String(recipeId ?? "").trim();
  if (!id) return;
  els.searchHint.textContent = "";
  const { response, data } = await getJson(`/api/diabetic/recipe?recipe_id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    els.searchHint.textContent = data?.error ? `Unable to load recipe: ${data.error}` : `Unable to load recipe (HTTP ${response.status}).`;
    return;
  }
  selectRecipeCard(data.recipe, { route: "local_recall", statusText: "Saved locally ✓" });
}

function clearSearchResults() {
  els.searchMatches.innerHTML = "";
  els.searchEmpty.style.display = "none";
  els.aiBlock.style.display = "none";
  els.aiRecipe.innerHTML = "";
}

function truncate(text, max = 120) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function tokenizeQuery(query) {
  return String(query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 3 && !["recipe", "recipes", "food", "make", "want"].includes(t));
}

async function fallbackLocalSearch(query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return [];

  const libraryUrl = activeMealFilter
    ? `/api/diabetic/recipes?meal_type=${encodeURIComponent(activeMealFilter)}`
    : "/api/diabetic/recipes";
  const { response, data } = await getJson(libraryUrl);
  if (!response.ok) return [];
  const recipes = Array.isArray(data.recipes) ? data.recipes : [];

  const matches = [];
  for (const recipe of recipes) {
    const title = String(recipe.title ?? "");
    const mealType = String(recipe.meal_type ?? "");
    const tags = Array.isArray(recipe.tags) ? recipe.tags.map((t) => String(t ?? "")) : [];
    let score = 0;
    for (const token of tokens) {
      if (title.toLowerCase().includes(token)) score += 4;
      if (mealType && mealType.toLowerCase() === token) score += 2;
      if (tags.some((t) => String(t ?? "").toLowerCase().includes(token))) score += 3;
    }
    if (score > 0) {
      matches.push({
        recipe_id: String(recipe.recipe_id ?? ""),
        title,
        meal_type: mealType || null,
        description: null,
        servings: recipe.servings ?? null,
        tags,
        gi_notes: null,
        recall_count: 0,
        match_score: score
      });
    }
  }

  matches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
  return matches.slice(0, 10);
}

function renderMatchCard(match) {
  const card = document.createElement("article");
  card.className = "ds-match";

  const tags = Array.isArray(match.tags) ? match.tags : [];
  const hasScore = match.match_score !== null && match.match_score !== undefined;
  const score = hasScore ? Number(match.match_score) : 0;

  card.innerHTML = `
    <div class="ds-match-head">
      <div>
        <h4>${escapeHtml(match.title || "Recipe")}</h4>
        <div class="ds-badges">
          <span class="ds-badge status-badge status-neutral">${escapeHtml(match.meal_type || "meal")}</span>
          ${(hasScore && Number.isFinite(score) && score > 0) ? `<span class="ds-badge status-badge status-neutral">score ${escapeHtml(score.toFixed(0))}</span>` : ""}
        </div>
      </div>
      <button type="button" class="ghost-action show-recipe">Show Recipe</button>
    </div>
    ${match.description ? `<p class="ds-match-desc">${escapeHtml(truncate(match.description, 140))}</p>` : ""}
    <div class="ds-match-meta">
      ${match.servings ? `<span class="ds-muted">${escapeHtml(`${match.servings} servings`)}</span>` : ""}
      ${match.gi_notes ? `<span class="ds-muted">${escapeHtml(truncate(match.gi_notes, 66))}</span>` : ""}
      ${tags.length ? `<span class="ds-muted">${escapeHtml(tags.slice(0, 4).join(", "))}</span>` : ""}
    </div>
  `;

  const button = card.querySelector(".show-recipe");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      await selectRecipeById(match.recipe_id);
    } finally {
      button.disabled = false;
      button.textContent = "Show Recipe";
    }
  });

  return card;
}

async function runSearch() {
  const query = String(els.searchInput.value ?? "").trim();
  clearSelectedRecipe();
  clearSearchResults();
  els.searchHint.textContent = "";
  if (!query) {
    els.searchHint.textContent = "Type a recipe idea to search.";
    return;
  }

  els.searchButton.disabled = true;
  els.searchButton.textContent = "Searching…";

  try {
    const useAi = Boolean(els.searchUseAi.checked);
    if (!useAi) {
      const mealParam = activeMealFilter ? `&meal_type=${encodeURIComponent(activeMealFilter)}` : "";
      const { response, data } = await getJson(`/api/diabetic/search?q=${encodeURIComponent(query)}${mealParam}`);
      if (!response.ok) {
        if (response.status === 404) {
          els.searchHint.textContent = "Search API not available on this server yet. Restart the server on the search-refine branch.";
          const matches = await fallbackLocalSearch(query);
          if (!matches.length) {
            els.searchEmpty.style.display = "";
            return;
          }
          for (const match of matches) {
            els.searchMatches.appendChild(renderMatchCard(match));
          }
          return;
        }
        els.searchHint.textContent = data?.error ? `Search failed: ${data.error}` : `Search failed (HTTP ${response.status}).`;
        failTelemetry("Search failed", data?.error || `HTTP ${response.status}`);
        return;
      }
      finishTelemetry("Local search", data);
      const matches = Array.isArray(data.matches) ? data.matches : [];
      if (!matches.length) {
        els.searchEmpty.style.display = "";
        return;
      }
      for (const match of matches) {
        els.searchMatches.appendChild(renderMatchCard(match));
      }
      return;
    }

    startAiTelemetry("Searching with AI", "Finding local matches and generating a new recipe...");
    const { response, data } = await postJson("/api/diabetic/search-create", {
      query,
      use_ai: true,
      meal_type: activeMealFilter || ""
    });

    let matches = Array.isArray(data.matches) ? data.matches : [];
    if (response.status === 404) {
      els.searchHint.textContent = "AI search-create API not available on this server yet. Falling back to Quick Ask.";
      matches = await fallbackLocalSearch(query);
      startAiTelemetry("Quick Ask", "Generating a recipe with AI...");
      const chat = await postJson("/api/diabetic/chat", { message: query });
      if (chat.response.ok && chat.data?.recipe) {
        els.aiBlock.style.display = "";
        const card = renderRecipeCard({
          recipe: chat.data.recipe,
          route: chat.data.route || "api_expand",
          statusText: chat.data.route === "local_recall" ? "" : "Saved locally ✓"
        });
        if (card) els.aiRecipe.appendChild(card);
        void refreshLibrary();
        finishTelemetry("Quick Ask", chat.data);
      } else if (!chat.response.ok) {
        failTelemetry("Quick Ask failed", chat.data?.error || `HTTP ${chat.response.status}`);
      }
    }
    if (!matches.length) {
      els.searchEmpty.style.display = "";
    } else {
      for (const match of matches) {
        els.searchMatches.appendChild(renderMatchCard(match));
      }
    }

    if (!response.ok) {
      if (data?.route === "api_unavailable") {
        els.searchHint.textContent = "Local matches were found, but OpenAI is not configured.";
        failTelemetry("AI unavailable", "OpenAI is not configured.");
      } else {
        els.searchHint.textContent = data?.error ? `Search failed: ${data.error}` : `Search failed (HTTP ${response.status}).`;
        failTelemetry("Search failed", data?.error || `HTTP ${response.status}`);
      }
    }

    if (data?.recipe) {
      els.aiBlock.style.display = "";
      const card = renderRecipeCard({ recipe: data.recipe, route: "api_expand", statusText: "Saved locally ✓" });
      if (card) els.aiRecipe.appendChild(card);
      void refreshLibrary();
      finishTelemetry("Search with AI", data);
    } else if (useAi && matches.length) {
      if (data?.ai_error) {
        els.searchHint.textContent = "Local matches were found, but AI could not create a new recipe.";
        failTelemetry("AI error", data.ai_error);
      }
    }
  } finally {
    els.searchButton.disabled = false;
    els.searchButton.textContent = "Search";
  }
}

async function startBuilder() {
  els.builderHint.textContent = "";
  const { response, data } = await postJson("/api/diabetic/builder/start", builderSessionId ? { session_id: builderSessionId } : {});
  if (!response.ok) {
    els.builderHint.textContent = response.status === 404
      ? "Unable to start builder (404). Restart the server on the DiabeticSpace branch."
      : (data?.error ? `Unable to start builder: ${data.error}` : `Unable to start builder (HTTP ${response.status}).`);
    return;
  }
  builderSessionId = data.session_id;
  builderStage = data.stage;
  appendMessage(els.builderMessages, "assistant", data.prompt || "Start building your recipe.");
}

async function nextBuilder(answer) {
  if (!builderSessionId) {
    await startBuilder();
    return;
  }
  const { response, data } = await postJson("/api/diabetic/builder/next", { session_id: builderSessionId, answer });
  if (!response.ok) {
    els.builderHint.textContent = data?.error || "Builder error.";
    return;
  }
  builderStage = data.stage;
  if (data.summary) {
    const summary = data.summary;
    appendMessage(els.builderMessages, "assistant", `Review:\nmeal_type: ${summary.meal_type}\ngoal: ${summary.goal}\ninclude: ${(summary.include_items || []).join(", ")}\navoid: ${(summary.avoid_items || []).join(", ")}\nservings: ${summary.servings}\nnotes: ${summary.extra_notes}`);
    appendMessage(els.builderMessages, "assistant", data.prompt || "Reply 'confirm' to build the recipe.");
    els.builderHint.innerHTML = `
      <button type="button" id="builder-confirm" class="primary-action">Confirm & Build</button>
      <span class="ds-muted ds-inline-help">or use: edit meal_type · goal · include_items · avoid_items · servings · extra_notes</span>
    `;
    const confirmBtn = document.getElementById("builder-confirm");
    confirmBtn.addEventListener("click", async () => {
      els.builderHint.textContent = "Building…";
      startAiTelemetry("Building recipe", "Generating a recipe with AI...");
      const { response: completeRes, data: completeData } = await postJson("/api/diabetic/builder/complete", { session_id: builderSessionId });
      if (!completeRes.ok) {
        els.builderHint.textContent = completeData?.error || "Build failed.";
        failTelemetry("Build failed", completeData?.error || `HTTP ${completeRes.status}`);
        return;
      }
      const card = renderRecipeCard({ recipe: completeData.recipe, route: completeData.route });
      if (card) els.recipeCards.prepend(card);
      appendMessage(els.builderMessages, "assistant", "Recipe built. Review the card and save if approved.");
      builderSessionId = "";
      builderStage = "";
      void refreshLibrary();
      finishTelemetry("Built", completeData);
    });
    return;
  }
  appendMessage(els.builderMessages, "assistant", data.prompt || "Next step.");
}

async function sendQuickMessage(message) {
  els.quickHint.textContent = "";
  appendMessage(els.quickMessages, "user", message);
  startAiTelemetry("Quick Ask", "Generating a recipe with AI...");
  const { response, data } = await postJson("/api/diabetic/chat", { message });
  if (!response.ok) {
    const msg = data?.error || "Request failed.";
    appendMessage(els.quickMessages, "assistant", msg);
    failTelemetry("Quick Ask failed", data?.error || `HTTP ${response.status}`);
    return;
  }
  const card = renderRecipeCard({ recipe: data.recipe, route: data.route });
  if (card) {
    els.recipeCards.prepend(card);
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  appendMessage(els.quickMessages, "assistant", "Recipe ready below. Save if approved.");
  void refreshLibrary();
  finishTelemetry("Quick Ask", data);
}

    els.modeSearch.addEventListener("click", () => setMode("search"));
    els.modeBuilder.addEventListener("click", () => setMode("builder"));
    els.modeQuick.addEventListener("click", () => setMode("quick"));
    els.modePlan.addEventListener("click", async () => {
    setMode("plan");
    const weekStart = ensureMealPlanWeekInput();
    if (weekStart) {
      await loadMealPlanWeek(weekStart);
    }
  });
    els.modeShopping.addEventListener("click", async () => {
    setMode("shopping");
    const lists = await refreshShoppingLists();
    if (!activeShoppingListId && lists[0]?.list_id) {
      await loadShoppingList(lists[0].list_id);
    }
  });
  els.modeSettings.addEventListener("click", () => setMode("settings"));
    els.home?.addEventListener("click", goHome);
    for (const btn of els.mealFilters) {
      btn.addEventListener("click", () => setMealFilter(btn.dataset.meal ?? ""));
    }

  els.filterFavorites?.addEventListener("click", () => setFavoritesOnly(!favoritesOnly));

  els.planLoad?.addEventListener("click", async () => {
    const weekStart = ensureMealPlanWeekInput();
    await loadMealPlanWeek(weekStart);
  });

  els.planCreate?.addEventListener("click", async () => {
    const weekStart = ensureMealPlanWeekInput();
    await createMealPlanWeek(weekStart);
  });

  els.planAdd?.addEventListener("click", addRecipeToCurrentPlan);
  els.planGenerateShopping?.addEventListener("click", generateShoppingFromCurrentPlan);
  els.planPrint?.addEventListener("click", () => {
    if (!activeMealPlanId) return;
    window.open(`/print/meal-plan.html?plan_id=${encodeURIComponent(activeMealPlanId)}`, "_blank");
  });

  els.shoppingNew?.addEventListener("click", createNewShoppingList);
  els.shoppingItemAdd?.addEventListener("click", addManualShoppingItem);
  els.shoppingItemName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.shoppingItemAdd?.click();
    }
  });
  els.shoppingPrint?.addEventListener("click", () => {
    if (!activeShoppingListId) return;
    window.open(`/print/shopping-list.html?list_id=${encodeURIComponent(activeShoppingListId)}`, "_blank");
  });

  els.settingsExport?.addEventListener("click", exportBackup);
  els.settingsImportFile?.addEventListener("change", async (event) => {
    const file = event?.target?.files?.[0] ?? null;
    if (!file) {
      pendingImportBackup = null;
      els.settingsImportStatus.textContent = "";
      els.settingsImportPreview.textContent = "";
      els.settingsImportApply?.setAttribute("disabled", "");
      return;
    }
    await handleImportFile(file);
  });
  els.settingsImportApply?.addEventListener("click", applyImport);

  els.settingsProviderRefresh?.addEventListener("click", refreshProviderSettings);
  els.settingsProviderSave?.addEventListener("click", saveProviderSettings);
  els.settingsProviderClear?.addEventListener("click", clearProviderKey);
  els.settingsProvider?.addEventListener("change", refreshProviderSettings);
  els.settingsProviderTest?.addEventListener("click", testProviderDefaultsEnhanced);
  els.settingsActiveTextProvider?.addEventListener("change", saveActiveProviders);
  els.settingsActiveImageProvider?.addEventListener("change", saveActiveProviders);

  // Profiles
  els.settingsProfileSave?.addEventListener("click", saveProfile);
  els.settingsProfileActivate?.addEventListener("click", activateSelectedProfile);
  els.settingsProfileClearActive?.addEventListener("click", clearActiveProfile);
  els.settingsProfileDelete?.addEventListener("click", deleteSelectedProfile);
  els.settingsProfileTest?.addEventListener("click", testProfileConnectionEnhanced);
  els.settingsProviderApiKey?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsProviderSave?.click();
    }
  });
  els.settingsProviderBaseUrl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsProviderSave?.click();
    }
  });
  els.settingsProviderModel?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsProviderSave?.click();
    }
  });
  els.settingsProviderImageModel?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsProviderSave?.click();
    }
  });

  els.settingsShareFile?.addEventListener("change", async (event) => {
    const file = event?.target?.files?.[0] ?? null;
    if (!file) {
      pendingSharePackage = null;
      if (els.settingsShareStatus) els.settingsShareStatus.textContent = "";
      if (els.settingsSharePreview) els.settingsSharePreview.textContent = "";
      els.settingsShareImport?.setAttribute("disabled", "");
      return;
    }
    await handleShareFile(file);
  });
  els.settingsShareImport?.addEventListener("click", applyShareImport);

  els.settingsUserRefresh?.addEventListener("click", refreshUsers);
  els.settingsUserSelect?.addEventListener("change", async () => {
    const selected = String(els.settingsUserSelect?.value ?? "").trim();
    if (selected) setActiveUserId(selected);
    await refreshUsers();
  });
  els.settingsUserCreate?.addEventListener("click", createProfile);
  els.settingsUserName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsUserCreate?.click();
    }
  });
  els.settingsUserPin?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsUserCreate?.click();
    }
  });
  els.settingsUserVerify?.addEventListener("click", verifyPin);
  els.settingsUserPinVerify?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.settingsUserVerify?.click();
    }
  });
  els.settingsPinLock?.addEventListener("change", async () => {
    await setPinLockSetting(Boolean(els.settingsPinLock?.checked));
  });

els.selectedClear?.addEventListener("click", () => {
  clearSelectedRecipe();
  renderBrowseList();
});

els.searchButton.addEventListener("click", runSearch);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.searchButton.click();
  }
});

els.builderStart.addEventListener("click", startBuilder);
els.builderReset.addEventListener("click", () => {
  builderSessionId = "";
  builderStage = "";
  els.builderMessages.innerHTML = "";
  els.builderHint.textContent = "";
});
els.builderSend.addEventListener("click", async () => {
  const answer = String(els.builderInput.value ?? "").trim();
  if (!answer) return;
  els.builderInput.value = "";
  appendMessage(els.builderMessages, "user", answer);
  await nextBuilder(answer);
});
els.builderInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.builderSend.click();
  }
});

els.quickSend.addEventListener("click", async () => {
  const message = String(els.quickInput.value ?? "").trim();
  if (!message) return;
  els.quickInput.value = "";
  await sendQuickMessage(message);
});
els.quickInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.quickSend.click();
  }
});

setMode("search");
setMealFilter("");
void refreshLibrary();
