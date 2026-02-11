import { getSupabase } from "./supabaseClient.js";

const DEFAULT_STATUS_OPTIONS = ["已匯款", "已採購", "已到貨", "已完成"];
const TRANSACTION_METHOD_OPTIONS = ["面交", "賣貨便"];
const SETTINGS_KEY_FIELDS = "order_form_defaults";
const SETTINGS_KEY_STATUSES = "order_status_options";

const PROTECTED_REQUIRED_KEYS = new Set([
  "customer_name",
  "phone",
  "email",
  "quantity",
  "transfer_account",
  "transfer_time",
  "transaction_method",
]);

const BASE_FIXED_FIELDS = [
  {
    key: "customer_name",
    label: "姓名",
    type: "text",
    required: true,
    visible: true,
    placeholder: "",
    options: [],
    source: "fixed",
  },
  {
    key: "phone",
    label: "手機",
    type: "tel",
    required: true,
    visible: true,
    placeholder: "例如 0912345678",
    options: [],
    source: "fixed",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    visible: true,
    placeholder: "",
    options: [],
    source: "fixed",
  },
  {
    key: "quantity",
    label: "數量",
    type: "number",
    required: true,
    visible: true,
    placeholder: "",
    options: [],
    source: "fixed",
  },
  {
    key: "transfer_account",
    label: "匯款帳號",
    type: "text",
    required: true,
    visible: true,
    placeholder: "例如 12345 或 完整帳號",
    options: [],
    source: "fixed",
  },
  {
    key: "transfer_time",
    label: "匯款時間",
    type: "datetime-local",
    required: true,
    visible: true,
    placeholder: "",
    options: [],
    source: "fixed",
  },
  {
    key: "transaction_method",
    label: "交易方式",
    type: "select",
    required: true,
    visible: true,
    placeholder: "",
    options: ["面交", "賣貨便"],
    source: "fixed",
  },
  {
    key: "note",
    label: "備註",
    type: "textarea",
    required: false,
    visible: true,
    placeholder: "可留空",
    options: [],
    source: "fixed",
  },
];

const pageType = document.body.dataset.adminPage || "dashboard";
const supabase = getSupabase();

const authPanel = document.querySelector("#auth-panel");
const adminPanel = document.querySelector("#admin-panel");
const authMessage = document.querySelector("#auth-message");
const loginForm = document.querySelector("#login-form");
const logoutButtons = document.querySelectorAll('[data-action="logout"]');

const globalDefaultsForm = document.querySelector("#global-defaults-form");
const globalFieldList = document.querySelector("#global-field-list");
const globalMessage = document.querySelector("#global-message");

const campaignForm = document.querySelector("#campaign-form");
const campaignMessage = document.querySelector("#campaign-message");
const campaignsFilter = document.querySelector("#campaigns-filter");
const reloadCampaignsBtn = document.querySelector("#reload-campaigns-btn");
const campaignSettingsForm = document.querySelector("#campaign-settings-form");
const campaignSettingsMessage = document.querySelector("#campaign-settings-message");
const settingsTitle = document.querySelector("#settings-title");
const settingsDescription = document.querySelector("#settings-description");
const settingsIsActive = document.querySelector("#settings-is-active");
const settingsCustomFields = document.querySelector("#settings-custom-fields");
const campaignFieldList = document.querySelector("#campaign-field-list");
const campaignUseGlobalStatus = document.querySelector("#campaign-use-global-status");
const campaignStatusEditor = document.querySelector("#campaign-status-editor");
const campaignStatusList = document.querySelector("#campaign-status-list");
const addCampaignStatusBtn = document.querySelector("#add-campaign-status-btn");

const ordersCampaignFilter = document.querySelector("#orders-campaign-filter");
const logsCampaignFilter = document.querySelector("#logs-campaign-filter");
const reloadOrdersBtn = document.querySelector("#reload-orders-btn");
const exportCsvBtn = document.querySelector("#export-csv-btn");
const reloadLogsBtn = document.querySelector("#reload-logs-btn");
const ordersMessage = document.querySelector("#orders-message");
const logsMessage = document.querySelector("#logs-message");
const ordersHead = document.querySelector("#orders-head");
const ordersBody = document.querySelector("#orders-body");
const statusLogsBody = document.querySelector("#status-logs-body");
const ordersViewButtons = document.querySelectorAll("[data-orders-view]");
const ordersListView = document.querySelector("#orders-list-view");
const ordersLogsView = document.querySelector("#orders-logs-view");

const globalStatusForm = document.querySelector("#global-status-form");
const globalStatusList = document.querySelector("#global-status-list");
const addGlobalStatusBtn = document.querySelector("#add-global-status-btn");
const globalStatusPreview = document.querySelector("#global-status-preview");
const globalStatusMessage = document.querySelector("#global-status-message");

let activeCampaigns = [];
let currentOrders = [];
let globalFieldConfig = buildBaseFixedFieldConfig();
let campaignFieldConfig = [];
let globalStatusOptions = [...DEFAULT_STATUS_OPTIONS];
let campaignStatusOptions = [];

function setMessage(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function digitsOnly(input) {
  return String(input || "").replace(/\D/g, "");
}

function formatDate(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toISOFromDatetimeLocal(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildBaseFixedFieldConfig() {
  return BASE_FIXED_FIELDS.map((field) => ({ ...field, options: [...(field.options || [])] }));
}

function normalizeCustomFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  return rawFields
    .map((field) => {
      if (!field || typeof field !== "object") return null;
      const key = String(field.key || "").trim();
      if (!key) return null;
      const type = String(field.type || "text").trim();
      const label = String(field.label || key).trim();
      const required = Boolean(field.required);
      const options = Array.isArray(field.options)
        ? field.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      return { key, type, label, required, options };
    })
    .filter(Boolean);
}

function normalizeFieldConfig(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  return rawFields
    .map((field) => {
      if (!field || typeof field !== "object") return null;
      const key = String(field.key || "").trim();
      if (!key) return null;
      return {
        key,
        label: String(field.label || key).trim(),
        type: String(field.type || "text").trim(),
        required: Boolean(field.required),
        visible: field.visible === undefined ? true : Boolean(field.visible),
        placeholder: String(field.placeholder || ""),
        options: Array.isArray(field.options)
          ? field.options.map((option) => String(option).trim()).filter(Boolean)
          : [],
        source: field.source === "custom" ? "custom" : "fixed",
      };
    })
    .filter(Boolean);
}

function normalizeStatusOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set();
  const result = [];
  for (const item of rawOptions) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function buildCustomFieldDefaults(customFields) {
  return customFields.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    visible: true,
    placeholder: "",
    options: [...(field.options || [])],
    source: "custom",
  }));
}

function mergeFieldConfig(existingConfig, fixedDefaults, customFields) {
  const normalizedExisting = normalizeFieldConfig(existingConfig);
  const normalizedFixed = normalizeFieldConfig(fixedDefaults).map((field) => ({
    ...field,
    source: "fixed",
  }));
  const customDefaults = buildCustomFieldDefaults(customFields);

  const fixedMap = new Map(normalizedFixed.map((field) => [field.key, field]));
  const customMap = new Map(customDefaults.map((field) => [field.key, field]));
  const allowedKeys = new Set([...fixedMap.keys(), ...customMap.keys()]);

  const result = [];
  const used = new Set();

  for (const existing of normalizedExisting) {
    if (!allowedKeys.has(existing.key)) continue;
    const fixed = fixedMap.get(existing.key);
    const custom = customMap.get(existing.key);

    let merged;
    if (fixed) {
      merged = {
        ...fixed,
        ...existing,
        key: fixed.key,
        type: fixed.type,
        options: [...(fixed.options || [])],
        source: "fixed",
      };
    } else {
      merged = {
        ...custom,
        ...existing,
        key: custom.key,
        type: custom.type,
        options: [...(custom.options || [])],
        source: "custom",
      };
    }

    if (PROTECTED_REQUIRED_KEYS.has(merged.key)) {
      merged.required = true;
      merged.visible = true;
    }

    result.push(merged);
    used.add(merged.key);
  }

  for (const fixed of normalizedFixed) {
    if (used.has(fixed.key)) continue;
    const merged = { ...fixed, options: [...(fixed.options || [])], source: "fixed" };
    if (PROTECTED_REQUIRED_KEYS.has(merged.key)) {
      merged.required = true;
      merged.visible = true;
    }
    result.push(merged);
    used.add(fixed.key);
  }

  for (const custom of customDefaults) {
    if (used.has(custom.key)) continue;
    result.push({ ...custom, options: [...(custom.options || [])], source: "custom" });
    used.add(custom.key);
  }

  return result;
}

function buildLabelMapFromConfig(fieldConfig, customFields) {
  const map = new Map();
  for (const field of fieldConfig) map.set(field.key, field.label || field.key);
  for (const custom of customFields) {
    if (!map.has(custom.key)) map.set(custom.key, custom.label || custom.key);
  }
  return map;
}

function parseCustomFieldsJson(inputText) {
  const text = String(inputText || "").trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("自訂欄位 JSON 格式錯誤");
  }
  return normalizeCustomFields(parsed);
}

function setSignedInState(isSignedIn) {
  if (authPanel) authPanel.classList.toggle("hidden", isSignedIn);
  if (adminPanel) adminPanel.classList.toggle("hidden", !isSignedIn);
}

async function requireSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function requireAdminUser() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user?.email) return null;

  const { data, error } = await supabase.from("admins").select("email").eq("email", user.email).maybeSingle();
  if (error) throw error;
  return data;
}

async function signOutAdmin() {
  await supabase.auth.signOut();
  setSignedInState(false);
  setMessage(authMessage, "已登出");
}

function setCampaignOptions(selectElements, selectedValue = "") {
  const selects = selectElements.filter(Boolean);
  if (!selects.length) return;

  if (!activeCampaigns.length) {
    for (const select of selects) {
      select.innerHTML = '<option value="">目前沒有活動</option>';
    }
    return;
  }

  const optionHtml = activeCampaigns
    .map((campaign) => `<option value="${campaign.id}">${escapeHtml(campaign.title)}${campaign.is_active ? "" : " (停用)"}</option>`)
    .join("");

  for (const select of selects) {
    select.innerHTML = optionHtml;
  }

  const nextValue = activeCampaigns.some((campaign) => campaign.id === selectedValue)
    ? selectedValue
    : activeCampaigns[0].id;
  for (const select of selects) {
    select.value = nextValue;
  }
}

function getCampaignById(campaignId) {
  return activeCampaigns.find((campaign) => campaign.id === campaignId) || null;
}

function getSelectedCampaignForCampaignPage() {
  if (!campaignsFilter) return null;
  return getCampaignById(campaignsFilter.value);
}

function getSelectedCampaignForOrdersPage() {
  if (!ordersCampaignFilter) return null;
  return getCampaignById(ordersCampaignFilter.value);
}

function getStatusOptionsForCampaign(campaign) {
  const campaignStatuses = normalizeStatusOptions(campaign?.status_options);
  if (campaignStatuses.length) return campaignStatuses;
  return globalStatusOptions.length ? globalStatusOptions : [...DEFAULT_STATUS_OPTIONS];
}

function renderStatusPreview() {
  if (!globalStatusPreview) return;
  const options = globalStatusOptions.length ? globalStatusOptions : [...DEFAULT_STATUS_OPTIONS];
  globalStatusPreview.innerHTML = options.map((status) => `<span class="status-chip">${escapeHtml(status)}</span>`).join("");
}

function renderStatusEditor(listEl, options, scope) {
  if (!listEl) return;
  if (!options.length) {
    listEl.innerHTML = '<p class="hint">目前沒有狀態，請至少新增一個。</p>';
    return;
  }

  listEl.innerHTML = options
    .map(
      (status, index) => `
        <div class="status-option-row" data-status-scope="${scope}" data-status-index="${index}">
          <input
            type="text"
            data-status-scope="${scope}"
            data-status-index="${index}"
            data-status-action="text"
            value="${escapeHtml(status)}"
          />
          <div class="status-option-actions">
            <button type="button" data-status-scope="${scope}" data-status-index="${index}" data-status-action="up">上移</button>
            <button type="button" data-status-scope="${scope}" data-status-index="${index}" data-status-action="down">下移</button>
            <button type="button" data-status-scope="${scope}" data-status-index="${index}" data-status-action="remove">刪除</button>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderGlobalStatusEditor() {
  renderStatusEditor(globalStatusList, globalStatusOptions, "global");
  renderStatusPreview();
}

function renderCampaignStatusEditor() {
  if (!campaignUseGlobalStatus || !campaignStatusEditor) return;
  const useGlobal = campaignUseGlobalStatus.checked;
  campaignStatusEditor.classList.toggle("hidden", useGlobal);
  if (!useGlobal) renderStatusEditor(campaignStatusList, campaignStatusOptions, "campaign");
}

function updateStatusOptionsByScope(scope, updater) {
  if (scope === "campaign") {
    campaignStatusOptions = normalizeStatusOptions(updater([...campaignStatusOptions]));
    renderCampaignStatusEditor();
    return;
  }

  globalStatusOptions = normalizeStatusOptions(updater([...globalStatusOptions]));
  if (!globalStatusOptions.length) globalStatusOptions = [...DEFAULT_STATUS_OPTIONS];
  renderGlobalStatusEditor();
}

function handleStatusEditorAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const scope = target.dataset.statusScope;
  const action = target.dataset.statusAction;
  const indexRaw = target.dataset.statusIndex;
  if (!scope || !action || indexRaw === undefined) return;

  const index = Number(indexRaw);
  if (!Number.isFinite(index)) return;

  if (action === "text" && event.type === "input") {
    updateStatusOptionsByScope(scope, (items) => {
      if (!items[index]) return items;
      items[index] = target.value;
      return items;
    });
    return;
  }

  if (event.type !== "click") return;

  if (action === "up") {
    updateStatusOptionsByScope(scope, (items) => {
      const next = [...items];
      if (index <= 0 || index >= next.length) return next;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    return;
  }

  if (action === "down") {
    updateStatusOptionsByScope(scope, (items) => {
      const next = [...items];
      if (index < 0 || index >= next.length - 1) return next;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    return;
  }

  if (action === "remove") {
    updateStatusOptionsByScope(scope, (items) => items.filter((_, itemIndex) => itemIndex !== index));
  }
}

function renderFieldEditor(listEl, fields, editorType) {
  if (!listEl) return;
  if (!fields.length) {
    listEl.innerHTML = '<p class="hint">目前沒有欄位。</p>';
    return;
  }

  listEl.innerHTML = fields
    .map((field, index) => {
      const isProtected = PROTECTED_REQUIRED_KEYS.has(field.key);
      const sourceText = field.source === "custom" ? "自訂欄位" : "預設欄位";
      const optionsText = field.type === "select" ? ` | options: ${(field.options || []).join("/")}` : "";

      return `
        <div class="field-editor-row" data-editor="${editorType}" data-index="${index}">
          <div class="field-editor-head">
            <span class="field-key">key: ${escapeHtml(field.key)} | type: ${escapeHtml(field.type)} | ${sourceText}${escapeHtml(optionsText)}</span>
            <div class="field-editor-actions">
              <button type="button" data-editor="${editorType}" data-index="${index}" data-action="move-up">上移</button>
              <button type="button" data-editor="${editorType}" data-index="${index}" data-action="move-down">下移</button>
            </div>
          </div>
          <div class="field-editor-grid">
            <label>
              欄位名稱
              <input type="text" data-editor="${editorType}" data-index="${index}" data-action="label" value="${escapeHtml(field.label)}" />
            </label>
            <label>
              Placeholder
              <input type="text" data-editor="${editorType}" data-index="${index}" data-action="placeholder" value="${escapeHtml(field.placeholder || "")}" />
            </label>
          </div>
          <div class="field-editor-grid">
            <label class="check-line">
              <input type="checkbox" data-editor="${editorType}" data-index="${index}" data-action="required" ${field.required ? "checked" : ""} ${isProtected ? "disabled" : ""} />
              必填
            </label>
            <label class="check-line">
              <input type="checkbox" data-editor="${editorType}" data-index="${index}" data-action="visible" ${field.visible ? "checked" : ""} ${isProtected ? "disabled" : ""} />
              顯示
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderGlobalFieldEditor() {
  renderFieldEditor(globalFieldList, globalFieldConfig, "global");
}

function renderCampaignFieldEditor() {
  renderFieldEditor(campaignFieldList, campaignFieldConfig, "campaign");
}

function moveField(fields, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= fields.length) return fields;
  const next = [...fields];
  const [picked] = next.splice(index, 1);
  next.splice(target, 0, picked);
  return next;
}

function applyFieldEditorAction(editorType, index, action, element) {
  const source = editorType === "global" ? globalFieldConfig : campaignFieldConfig;
  if (!source[index]) return;

  if (action === "move-up") {
    const moved = moveField(source, index, -1);
    if (editorType === "global") {
      globalFieldConfig = moved;
      renderGlobalFieldEditor();
    } else {
      campaignFieldConfig = moved;
      renderCampaignFieldEditor();
    }
    return;
  }

  if (action === "move-down") {
    const moved = moveField(source, index, 1);
    if (editorType === "global") {
      globalFieldConfig = moved;
      renderGlobalFieldEditor();
    } else {
      campaignFieldConfig = moved;
      renderCampaignFieldEditor();
    }
    return;
  }

  const next = [...source];
  const field = { ...next[index] };

  if (action === "label") field.label = String(element.value || "").trim() || field.key;
  if (action === "placeholder") field.placeholder = String(element.value || "");
  if (action === "required") field.required = Boolean(element.checked);
  if (action === "visible") field.visible = Boolean(element.checked);

  if (PROTECTED_REQUIRED_KEYS.has(field.key)) {
    field.required = true;
    field.visible = true;
  }

  next[index] = field;
  if (editorType === "global") {
    globalFieldConfig = next;
  } else {
    campaignFieldConfig = next;
  }
}

function setFieldEditorFromEvent(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const editorType = target.dataset.editor;
  const action = target.dataset.action;
  const indexRaw = target.dataset.index;
  if (!editorType || !action || indexRaw === undefined) return;

  const index = Number(indexRaw);
  if (!Number.isFinite(index)) return;

  if (event.type === "click" && (action === "move-up" || action === "move-down")) {
    applyFieldEditorAction(editorType, index, action, target);
    return;
  }

  if (event.type === "input" || event.type === "change") {
    applyFieldEditorAction(editorType, index, action, target);
  }
}

async function loadGlobalFieldConfig() {
  if (!globalFieldList) return;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY_FIELDS)
    .maybeSingle();

  if (error) {
    globalFieldConfig = buildBaseFixedFieldConfig();
    renderGlobalFieldEditor();
    return;
  }

  const loaded = normalizeFieldConfig(data?.value?.field_config);
  globalFieldConfig = mergeFieldConfig(loaded, buildBaseFixedFieldConfig(), []);
  renderGlobalFieldEditor();
}

async function saveGlobalFieldConfig() {
  const normalized = mergeFieldConfig(globalFieldConfig, buildBaseFixedFieldConfig(), []);
  globalFieldConfig = normalized;

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_KEY_FIELDS,
      value: {
        field_config: normalized,
      },
    },
    { onConflict: "key" },
  );

  if (error) throw error;
  renderGlobalFieldEditor();
}

async function loadGlobalStatusOptions() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY_STATUSES)
    .maybeSingle();

  if (error) {
    globalStatusOptions = [...DEFAULT_STATUS_OPTIONS];
    renderGlobalStatusEditor();
    return;
  }

  const loaded = normalizeStatusOptions(data?.value?.options);
  globalStatusOptions = loaded.length ? loaded : [...DEFAULT_STATUS_OPTIONS];
  renderGlobalStatusEditor();
}

async function saveGlobalStatusOptions() {
  globalStatusOptions = normalizeStatusOptions(globalStatusOptions);
  if (!globalStatusOptions.length) throw new Error("至少需要一個全域狀態");

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_KEY_STATUSES,
      value: {
        options: globalStatusOptions,
      },
    },
    { onConflict: "key" },
  );

  if (error) throw error;
  renderGlobalStatusEditor();
}

async function loadCampaignsForAdmin() {
  const allSelects = [campaignsFilter, ordersCampaignFilter, logsCampaignFilter].filter(Boolean);
  const previousSelected = allSelects[0]?.value || "";

  let query = supabase
    .from("campaigns")
    .select("id, slug, title, description, is_active, custom_fields, field_config, status_options")
    .order("created_at", { ascending: false });
  let { data, error } = await query;

  if (error && /status_options/i.test(error.message || "")) {
    const fallback = await supabase
      .from("campaigns")
      .select("id, slug, title, description, is_active, custom_fields, field_config")
      .order("created_at", { ascending: false });
    data = (fallback.data || []).map((campaign) => ({ ...campaign, status_options: [] }));
    error = fallback.error;
  }

  if (error && /field_config/i.test(error.message || "")) {
    const fallback = await supabase
      .from("campaigns")
      .select("id, slug, title, description, is_active, custom_fields, status_options")
      .order("created_at", { ascending: false });
    data = (fallback.data || []).map((campaign) => ({ ...campaign, field_config: [] }));
    error = fallback.error;
  }

  if (error && /field_config|status_options/i.test(error.message || "")) {
    const fallback = await supabase
      .from("campaigns")
      .select("id, slug, title, description, is_active, custom_fields")
      .order("created_at", { ascending: false });
    data = (fallback.data || []).map((campaign) => ({ ...campaign, field_config: [], status_options: [] }));
    error = fallback.error;
  }

  if (error) throw error;

  activeCampaigns = (data || []).map((campaign) => ({
    ...campaign,
    custom_fields: normalizeCustomFields(campaign.custom_fields),
    field_config: normalizeFieldConfig(campaign.field_config),
    status_options: normalizeStatusOptions(campaign.status_options),
  }));

  setCampaignOptions(allSelects, previousSelected);
}

function slugifyTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function generateCampaignSlug(title) {
  const base = (slugifyTitle(title) || "campaign").slice(0, 28);
  const dayCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let suffix = Math.random().toString(36).slice(2, 6);
  let slug = `${base}-${dayCode}-${suffix}`;

  while (activeCampaigns.some((campaign) => campaign.slug === slug)) {
    suffix = Math.random().toString(36).slice(2, 6);
    slug = `${base}-${dayCode}-${suffix}`;
  }

  return slug;
}

function populateCampaignSettings() {
  const campaign = getSelectedCampaignForCampaignPage();
  if (!campaign || !campaignSettingsForm) {
    if (campaignSettingsForm) {
      campaignSettingsForm.reset();
      for (const element of campaignSettingsForm.elements) {
        element.disabled = true;
      }
    }
    campaignFieldConfig = [];
    campaignStatusOptions = [];
    renderCampaignFieldEditor();
    renderCampaignStatusEditor();
    return;
  }

  for (const element of campaignSettingsForm.elements) {
    element.disabled = false;
  }

  settingsTitle.value = campaign.title || "";
  settingsDescription.value = campaign.description || "";
  settingsIsActive.checked = Boolean(campaign.is_active);
  settingsCustomFields.value = JSON.stringify(campaign.custom_fields, null, 2);

  campaignFieldConfig = mergeFieldConfig(campaign.field_config, globalFieldConfig, campaign.custom_fields);
  renderCampaignFieldEditor();

  const statuses = normalizeStatusOptions(campaign.status_options);
  const useGlobal = statuses.length === 0;
  campaignUseGlobalStatus.checked = useGlobal;
  campaignStatusOptions = useGlobal ? [...globalStatusOptions] : statuses;
  renderCampaignStatusEditor();
}

function renderOrdersHeader(campaign) {
  if (!ordersHead) return;
  const customFields = campaign?.custom_fields || [];
  const effectiveFieldConfig = mergeFieldConfig(campaign?.field_config, buildBaseFixedFieldConfig(), customFields);
  const labelMap = buildLabelMapFromConfig(effectiveFieldConfig, customFields);

  ordersHead.innerHTML = `
    <tr>
      <th>${escapeHtml(labelMap.get("customer_name") || "姓名")}</th>
      <th>${escapeHtml(labelMap.get("phone") || "手機")}</th>
      <th>${escapeHtml(labelMap.get("email") || "Email")}</th>
      <th>${escapeHtml(labelMap.get("quantity") || "數量")}</th>
      <th>${escapeHtml(labelMap.get("transfer_account") || "匯款帳號")}</th>
      <th>${escapeHtml(labelMap.get("transfer_time") || "匯款時間")}</th>
      <th>${escapeHtml(labelMap.get("transaction_method") || "交易方式")}</th>
      ${customFields.map((field) => `<th>${escapeHtml(labelMap.get(field.key) || field.label)}</th>`).join("")}
      <th>${escapeHtml(labelMap.get("note") || "備註")}</th>
      <th>狀態</th>
      <th>更新</th>
      <th>刪除</th>
    </tr>
  `;
}

function renderCustomFieldCell(order, field) {
  const value = order.extra_data?.[field.key] ?? "";
  const escapedKey = escapeHtml(field.key);

  if (field.type === "textarea") {
    return `<td><textarea data-order-id="${order.id}" data-custom-key="${escapedKey}" rows="2">${escapeHtml(value)}</textarea></td>`;
  }

  if (field.type === "select") {
    const options = (field.options || [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}" ${String(value) === option ? "selected" : ""}>${escapeHtml(option)}</option>`,
      )
      .join("");
    return `<td><select data-order-id="${order.id}" data-custom-key="${escapedKey}">${options}</select></td>`;
  }

  const inputType = field.type === "number" ? "number" : "text";
  return `<td><input data-order-id="${order.id}" data-custom-key="${escapedKey}" type="${inputType}" value="${escapeHtml(value)}" /></td>`;
}

function renderStatusSelect(order, statusOptions) {
  return `<select class="status-select" data-order-id="${order.id}" data-field="status">${statusOptions
    .map((status) => `<option value="${escapeHtml(status)}" ${status === order.status ? "selected" : ""}>${escapeHtml(status)}</option>`)
    .join("")}</select>`;
}

function renderTransactionMethodSelect(order) {
  return `<select data-order-id="${order.id}" data-field="transaction_method">${TRANSACTION_METHOD_OPTIONS.map(
    (method) => `<option value="${method}" ${method === order.transaction_method ? "selected" : ""}>${method}</option>`,
  ).join("")}</select>`;
}

function renderOrders(rows) {
  if (!ordersBody) return;
  const campaign = getSelectedCampaignForOrdersPage();
  const customFields = campaign?.custom_fields || [];
  const statusOptions = getStatusOptionsForCampaign(campaign);
  renderOrdersHeader(campaign);

  if (!rows.length) {
    ordersBody.innerHTML = "";
    return;
  }

  ordersBody.innerHTML = rows
    .map((order) => {
      const customCells = customFields.map((field) => renderCustomFieldCell(order, field)).join("");
      return `
        <tr data-order-row-id="${order.id}">
          <td><input data-order-id="${order.id}" data-field="customer_name" type="text" value="${escapeHtml(order.customer_name)}" /></td>
          <td><input data-order-id="${order.id}" data-field="phone" type="text" value="${escapeHtml(order.phone)}" /></td>
          <td><input data-order-id="${order.id}" data-field="email" type="email" value="${escapeHtml(order.email)}" /></td>
          <td><input data-order-id="${order.id}" data-field="quantity" type="number" min="1" value="${order.quantity}" /></td>
          <td><input data-order-id="${order.id}" data-field="transfer_account" type="text" value="${escapeHtml(order.transfer_account)}" /></td>
          <td>
            <input
              data-order-id="${order.id}"
              data-field="transfer_time"
              type="datetime-local"
              value="${toDatetimeLocalValue(order.transfer_time)}"
            />
          </td>
          <td>${renderTransactionMethodSelect(order)}</td>
          ${customCells}
          <td><textarea data-order-id="${order.id}" data-field="note" rows="2">${escapeHtml(order.note || "")}</textarea></td>
          <td>${renderStatusSelect(order, statusOptions)}</td>
          <td><button type="button" data-action="update" data-order-id="${order.id}">儲存</button></td>
          <td><button type="button" data-action="delete" data-order-id="${order.id}">刪除</button></td>
        </tr>
      `;
    })
    .join("");
}

async function loadOrders() {
  const campaignId = ordersCampaignFilter?.value;
  if (!campaignId || !ordersBody) {
    currentOrders = [];
    renderOrders(currentOrders);
    return;
  }

  const selectedCampaign = getSelectedCampaignForOrdersPage();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, customer_name, phone, email, quantity, transfer_account, transfer_time, transaction_method, note, status, extra_data, created_at, updated_at",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  currentOrders = (data || []).map((item) => ({
    ...item,
    campaign_title: selectedCampaign?.title || "",
    transaction_method: item.transaction_method || "面交",
    extra_data: item.extra_data && typeof item.extra_data === "object" ? item.extra_data : {},
  }));

  renderOrders(currentOrders);
}

function findOrderById(orderId) {
  return currentOrders.find((order) => order.id === orderId) || null;
}

function getOrderFieldElement(orderId, field) {
  return ordersBody?.querySelector(`[data-order-id="${orderId}"][data-field="${field}"]`) || null;
}

function collectOrderPayload(orderId) {
  const baseOrder = findOrderById(orderId);
  if (!baseOrder) throw new Error("找不到訂單");

  const customerName = getOrderFieldElement(orderId, "customer_name")?.value?.trim();
  const phone = getOrderFieldElement(orderId, "phone")?.value?.trim();
  const email = getOrderFieldElement(orderId, "email")?.value?.trim();
  const quantityText = getOrderFieldElement(orderId, "quantity")?.value;
  const transferAccount = getOrderFieldElement(orderId, "transfer_account")?.value?.trim();
  const transferTimeInput = getOrderFieldElement(orderId, "transfer_time")?.value;
  const transactionMethod = getOrderFieldElement(orderId, "transaction_method")?.value;
  const note = getOrderFieldElement(orderId, "note")?.value?.trim() || "";
  const status = getOrderFieldElement(orderId, "status")?.value;

  const quantity = Number(quantityText);
  const transferTime = toISOFromDatetimeLocal(transferTimeInput);
  const statusOptions = getStatusOptionsForCampaign(getSelectedCampaignForOrdersPage());

  if (!customerName) throw new Error("姓名不可空白");
  if (!phone) throw new Error("手機不可空白");
  if (!email) throw new Error("Email 不可空白");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("數量需為正整數");
  if (!transferAccount) throw new Error("匯款帳號不可空白");
  if (!transferTime) throw new Error("匯款時間格式錯誤");
  if (!TRANSACTION_METHOD_OPTIONS.includes(transactionMethod)) throw new Error("交易方式錯誤");
  if (!statusOptions.includes(status)) throw new Error("狀態錯誤");

  const campaign = getSelectedCampaignForOrdersPage();
  const customFields = campaign?.custom_fields || [];
  const extraData = { ...(baseOrder.extra_data || {}) };

  for (const field of customFields) {
    const element = ordersBody.querySelector(`[data-order-id="${orderId}"][data-custom-key="${field.key}"]`);
    if (!element) continue;
    extraData[field.key] = element.value?.trim?.() ?? "";
  }

  return {
    customer_name: customerName,
    phone,
    email,
    quantity,
    transfer_account: transferAccount,
    transfer_time: transferTime,
    transaction_method: transactionMethod,
    note,
    status,
    extra_data: extraData,
  };
}

async function updateOrder(orderId, payload) {
  const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
  if (error) throw error;
}

async function deleteOrder(orderId) {
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

function renderStatusLogs(rows) {
  if (!statusLogsBody) return;
  if (!rows.length) {
    statusLogsBody.innerHTML = "";
    return;
  }

  statusLogsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.order_id)}</td>
          <td>${escapeHtml(row.old_status || "-")}</td>
          <td>${escapeHtml(row.new_status || "-")}</td>
          <td>${escapeHtml(row.changed_by || "-")}</td>
          <td>${formatDate(row.changed_at)}</td>
        </tr>
      `,
    )
    .join("");
}

async function loadStatusLogs() {
  if (!statusLogsBody || !logsCampaignFilter?.value) {
    renderStatusLogs([]);
    return;
  }

  const campaignId = logsCampaignFilter.value;
  const { data, error } = await supabase
    .from("order_status_logs")
    .select("order_id, old_status, new_status, changed_by, changed_at")
    .eq("campaign_id", campaignId)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) {
    if (/order_status_logs|relation|does not exist/i.test(error.message || "")) {
      setMessage(logsMessage, "尚未啟用狀態紀錄表，請先重跑 schema.sql。", "error");
      renderStatusLogs([]);
      return;
    }
    throw error;
  }

  renderStatusLogs(data || []);
}

function toCsvText(rows, campaign, fieldConfig) {
  const customFields = campaign?.custom_fields || [];
  const labelMap = buildLabelMapFromConfig(fieldConfig, customFields);

  const headers = [
    "活動",
    labelMap.get("customer_name") || "姓名",
    labelMap.get("phone") || "手機",
    labelMap.get("email") || "Email",
    labelMap.get("quantity") || "數量",
    labelMap.get("transfer_account") || "匯款帳號",
    labelMap.get("transfer_time") || "匯款時間",
    labelMap.get("transaction_method") || "交易方式",
    ...customFields.map((field) => labelMap.get(field.key) || field.label),
    labelMap.get("note") || "備註",
    "狀態",
    "建立時間",
    "更新時間",
  ];

  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCell).join(",")];

  for (const row of rows) {
    const customValues = customFields.map((field) => row.extra_data?.[field.key] ?? "");
    lines.push(
      [
        row.campaign_title,
        row.customer_name,
        row.phone,
        row.email,
        row.quantity,
        row.transfer_account,
        formatDate(row.transfer_time),
        row.transaction_method,
        ...customValues,
        row.note,
        row.status,
        formatDate(row.created_at),
        formatDate(row.updated_at),
      ]
        .map(escapeCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

function downloadCsv(filename, text) {
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function initCampaignsPageData() {
  await loadGlobalStatusOptions();
  await loadGlobalFieldConfig();
  await loadCampaignsForAdmin();
  populateCampaignSettings();
}

async function initOrdersPageData() {
  await loadGlobalStatusOptions();
  await loadCampaignsForAdmin();
  await loadOrders();
  await loadStatusLogs();
}

async function initSettingsPageData() {
  await loadGlobalStatusOptions();
}

async function initPageData() {
  if (pageType === "campaigns") {
    await initCampaignsPageData();
    return;
  }
  if (pageType === "orders") {
    await initOrdersPageData();
    return;
  }
  if (pageType === "settings") {
    await initSettingsPageData();
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(authMessage, "登入中...");

  try {
    const email = document.querySelector("#admin-email").value.trim();
    const password = document.querySelector("#admin-password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const adminRow = await requireAdminUser();
    if (!adminRow) {
      await supabase.auth.signOut();
      throw new Error("此帳號沒有管理權限");
    }

    setSignedInState(true);
    await initPageData();
    setMessage(authMessage, "");
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `登入失敗：${error.message}`, "error");
  }
});

for (const button of logoutButtons) {
  button.addEventListener("click", async () => {
    await signOutAdmin();
  });
}

globalFieldList?.addEventListener("click", setFieldEditorFromEvent);
globalFieldList?.addEventListener("input", setFieldEditorFromEvent);
globalFieldList?.addEventListener("change", setFieldEditorFromEvent);

campaignFieldList?.addEventListener("click", setFieldEditorFromEvent);
campaignFieldList?.addEventListener("input", setFieldEditorFromEvent);
campaignFieldList?.addEventListener("change", setFieldEditorFromEvent);

globalStatusList?.addEventListener("click", handleStatusEditorAction);
globalStatusList?.addEventListener("input", handleStatusEditorAction);
campaignStatusList?.addEventListener("click", handleStatusEditorAction);
campaignStatusList?.addEventListener("input", handleStatusEditorAction);

addGlobalStatusBtn?.addEventListener("click", () => {
  globalStatusOptions = [...globalStatusOptions, "新狀態"];
  renderGlobalStatusEditor();
});

addCampaignStatusBtn?.addEventListener("click", () => {
  campaignStatusOptions = [...campaignStatusOptions, "新狀態"];
  renderCampaignStatusEditor();
});

campaignUseGlobalStatus?.addEventListener("change", () => {
  if (campaignUseGlobalStatus.checked) {
    campaignStatusOptions = [...globalStatusOptions];
  } else if (!campaignStatusOptions.length) {
    campaignStatusOptions = [...globalStatusOptions];
  }
  renderCampaignStatusEditor();
});

globalStatusForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(globalStatusMessage, "儲存中...");
  try {
    await saveGlobalStatusOptions();
    setMessage(globalStatusMessage, "全域狀態已更新。", "success");
  } catch (error) {
    setMessage(globalStatusMessage, `儲存失敗：${error.message}`, "error");
  }
});

globalDefaultsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(globalMessage, "儲存中...");
  try {
    await saveGlobalFieldConfig();
    await loadCampaignsForAdmin();
    populateCampaignSettings();
    setMessage(globalMessage, "全域欄位模板已更新。", "success");
  } catch (error) {
    setMessage(globalMessage, `儲存失敗：${error.message}`, "error");
  }
});

settingsCustomFields?.addEventListener("input", () => {
  try {
    const parsed = parseCustomFieldsJson(settingsCustomFields.value);
    campaignFieldConfig = mergeFieldConfig(campaignFieldConfig, globalFieldConfig, parsed);
    renderCampaignFieldEditor();
  } catch {
    // Skip while JSON is mid-edit.
  }
});

reloadCampaignsBtn?.addEventListener("click", async () => {
  setMessage(campaignSettingsMessage, "載入中...");
  try {
    await loadCampaignsForAdmin();
    populateCampaignSettings();
    setMessage(campaignSettingsMessage, "活動列表已更新。", "success");
  } catch (error) {
    setMessage(campaignSettingsMessage, `載入失敗：${error.message}`, "error");
  }
});

campaignsFilter?.addEventListener("change", () => {
  populateCampaignSettings();
  setMessage(campaignSettingsMessage, "");
});

campaignForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(campaignMessage, "建立中...");

  try {
    const title = document.querySelector("#campaign-title").value.trim();
    const description = document.querySelector("#campaign-description").value.trim();
    const customFields = parseCustomFieldsJson(document.querySelector("#campaign-custom-fields").value);

    if (!title) throw new Error("請輸入活動標題");
    if (description.length > 3000) throw new Error("活動說明不可超過 3000 字");

    const slug = generateCampaignSlug(title);
    const fieldConfig = mergeFieldConfig([], globalFieldConfig, customFields);

    let { data, error } = await supabase
      .from("campaigns")
      .insert({
        slug,
        title,
        description,
        custom_fields: customFields,
        field_config: fieldConfig,
        status_options: [],
        is_active: true,
      })
      .select("id")
      .single();

    if (error && /field_config|status_options/i.test(error.message || "")) {
      const fallback = await supabase
        .from("campaigns")
        .insert({
          slug,
          title,
          description,
          custom_fields: customFields,
          is_active: true,
        })
        .select("id")
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;

    campaignForm.reset();
    setMessage(campaignMessage, `活動建立完成（代碼：${slug}）。`, "success");

    await loadCampaignsForAdmin();
    if (data?.id && campaignsFilter) {
      campaignsFilter.value = data.id;
      populateCampaignSettings();
    }
  } catch (error) {
    setMessage(campaignMessage, `建立失敗：${error.message}`, "error");
  }
});

campaignSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(campaignSettingsMessage, "儲存中...");

  try {
    const campaign = getSelectedCampaignForCampaignPage();
    if (!campaign) throw new Error("請先選擇活動");

    const title = settingsTitle.value.trim();
    const description = settingsDescription.value.trim();
    const isActive = settingsIsActive.checked;
    const parsedCustomFields = parseCustomFieldsJson(settingsCustomFields.value);
    if (!title) throw new Error("活動標題不可空白");
    if (description.length > 3000) throw new Error("活動說明不可超過 3000 字");

    campaignFieldConfig = mergeFieldConfig(campaignFieldConfig, globalFieldConfig, parsedCustomFields);
    if (!campaignUseGlobalStatus.checked) {
      campaignStatusOptions = normalizeStatusOptions(campaignStatusOptions);
      if (!campaignStatusOptions.length) throw new Error("活動自訂狀態至少需要一項");
    }

    let { error } = await supabase
      .from("campaigns")
      .update({
        title,
        description,
        is_active: isActive,
        custom_fields: parsedCustomFields,
        field_config: campaignFieldConfig,
        status_options: campaignUseGlobalStatus.checked ? [] : campaignStatusOptions,
      })
      .eq("id", campaign.id);

    if (error && /field_config|status_options/i.test(error.message || "")) {
      const fallback = await supabase
        .from("campaigns")
        .update({
          title,
          description,
          is_active: isActive,
          custom_fields: parsedCustomFields,
          field_config: campaignFieldConfig,
        })
        .eq("id", campaign.id);
      error = fallback.error;
    }

    if (error) throw error;

    await loadCampaignsForAdmin();
    campaignsFilter.value = campaign.id;
    populateCampaignSettings();
    setMessage(campaignSettingsMessage, "活動設定已更新。", "success");
  } catch (error) {
    setMessage(campaignSettingsMessage, `更新失敗：${error.message}`, "error");
  }
});

reloadOrdersBtn?.addEventListener("click", async () => {
  setMessage(ordersMessage, "載入中...");
  try {
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setMessage(ordersMessage, `載入失敗：${error.message}`, "error");
  }
});

ordersCampaignFilter?.addEventListener("change", async () => {
  if (logsCampaignFilter) logsCampaignFilter.value = ordersCampaignFilter.value;
  setMessage(ordersMessage, "載入中...");
  try {
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setMessage(ordersMessage, `載入失敗：${error.message}`, "error");
  }
});

logsCampaignFilter?.addEventListener("change", async () => {
  setMessage(logsMessage, "載入中...");
  try {
    await loadStatusLogs();
    setMessage(logsMessage, "狀態紀錄已更新。", "success");
  } catch (error) {
    setMessage(logsMessage, `載入失敗：${error.message}`, "error");
  }
});

ordersBody?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const orderId = target.dataset.orderId;
  if (!orderId) return;

  if (target.dataset.action === "update") {
    setMessage(ordersMessage, "更新中...");
    try {
      const payload = collectOrderPayload(orderId);
      await updateOrder(orderId, payload);
      await loadOrders();
      await loadStatusLogs();
      setMessage(ordersMessage, "訂單已更新。", "success");
    } catch (error) {
      setMessage(ordersMessage, `更新失敗：${error.message}`, "error");
    }
    return;
  }

  if (target.dataset.action === "delete") {
    const confirmDelete = window.confirm("確定要刪除這筆訂單嗎？");
    if (!confirmDelete) return;

    setMessage(ordersMessage, "刪除中...");
    try {
      await deleteOrder(orderId);
      await loadOrders();
      await loadStatusLogs();
      setMessage(ordersMessage, "訂單已刪除。", "success");
    } catch (error) {
      setMessage(ordersMessage, `刪除失敗：${error.message}`, "error");
    }
  }
});

reloadLogsBtn?.addEventListener("click", async () => {
  setMessage(logsMessage, "載入中...");
  try {
    await loadStatusLogs();
    setMessage(logsMessage, "狀態紀錄已更新。", "success");
  } catch (error) {
    setMessage(logsMessage, `載入失敗：${error.message}`, "error");
  }
});

ordersViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.ordersView;
    ordersViewButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    ordersListView?.classList.toggle("hidden", view !== "list");
    ordersLogsView?.classList.toggle("hidden", view !== "logs");
  });
});

exportCsvBtn?.addEventListener("click", () => {
  try {
    if (!currentOrders.length) {
      setMessage(ordersMessage, "目前無資料可匯出");
      return;
    }

    const campaign = getSelectedCampaignForOrdersPage();
    const fieldConfig = mergeFieldConfig(campaign?.field_config, buildBaseFixedFieldConfig(), campaign?.custom_fields || []);
    const safeSlug = campaign?.slug || "orders";
    const csv = toCsvText(currentOrders, campaign, fieldConfig);
    downloadCsv(`${safeSlug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setMessage(ordersMessage, "CSV 匯出完成。", "success");
  } catch (error) {
    setMessage(ordersMessage, `匯出失敗：${error.message}`, "error");
  }
});

(async function bootstrap() {
  try {
    const session = await requireSession();
    if (!session) {
      setSignedInState(false);
      return;
    }

    const adminRow = await requireAdminUser();
    if (!adminRow) {
      await supabase.auth.signOut();
      setSignedInState(false);
      setMessage(authMessage, "此帳號沒有管理權限，請使用管理員帳號登入。", "error");
      return;
    }

    setSignedInState(true);
    await initPageData();

    if (ordersMessage && pageType === "orders") {
      setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
    }
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `初始化失敗：${error.message}`, "error");
  }
})();
