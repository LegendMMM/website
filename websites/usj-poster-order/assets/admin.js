import { getSupabase } from "./supabaseClient.js";

const STATUS_OPTIONS = ["已匯款", "已採購", "已到貨", "已完成"];
const TRANSACTION_METHOD_OPTIONS = ["面交", "賣貨便"];
const SETTINGS_KEY = "order_form_defaults";

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

const authPanel = document.querySelector("#auth-panel");
const adminPanel = document.querySelector("#admin-panel");
const authMessage = document.querySelector("#auth-message");
const campaignMessage = document.querySelector("#campaign-message");
const globalMessage = document.querySelector("#global-message");
const ordersMessage = document.querySelector("#orders-message");

const loginForm = document.querySelector("#login-form");
const globalDefaultsForm = document.querySelector("#global-defaults-form");
const campaignForm = document.querySelector("#campaign-form");
const campaignSettingsForm = document.querySelector("#campaign-settings-form");
const adminCampaignFilter = document.querySelector("#admin-campaign-filter");
const ordersHead = document.querySelector("#orders-head");
const ordersBody = document.querySelector("#orders-body");
const reloadOrdersBtn = document.querySelector("#reload-orders-btn");
const exportCsvBtn = document.querySelector("#export-csv-btn");
const logoutBtn = document.querySelector("#logout-btn");

const settingsTitle = document.querySelector("#settings-title");
const settingsDescription = document.querySelector("#settings-description");
const settingsNotice = document.querySelector("#settings-notice");
const settingsIsActive = document.querySelector("#settings-is-active");
const settingsCustomFields = document.querySelector("#settings-custom-fields");
const globalFieldList = document.querySelector("#global-field-list");
const campaignFieldList = document.querySelector("#campaign-field-list");

let activeCampaigns = [];
let currentOrders = [];
let globalFieldConfig = buildBaseFixedFieldConfig();
let campaignFieldConfig = [];

function setMessage(el, text, type = "") {
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

function getSelectedCampaign() {
  return activeCampaigns.find((campaign) => campaign.id === adminCampaignFilter.value) || null;
}

function setSignedInState(isSignedIn) {
  authPanel.classList.toggle("hidden", isSignedIn);
  adminPanel.classList.toggle("hidden", !isSignedIn);
}

function disableCampaignSettings(disabled) {
  for (const element of campaignSettingsForm.elements) {
    element.disabled = disabled;
  }
}

function renderFieldEditor(listEl, fields, editorType) {
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

function moveField(fields, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= fields.length) return fields;

  const next = [...fields];
  const [picked] = next.splice(index, 1);
  next.splice(target, 0, picked);
  return next;
}

function applyEditorAction(editorType, index, action, element) {
  const source = editorType === "global" ? globalFieldConfig : campaignFieldConfig;
  if (!source[index]) return;

  if (action === "move-up") {
    const moved = moveField(source, index, -1);
    if (editorType === "global") {
      globalFieldConfig = moved;
      renderFieldEditor(globalFieldList, globalFieldConfig, "global");
    } else {
      campaignFieldConfig = moved;
      renderFieldEditor(campaignFieldList, campaignFieldConfig, "campaign");
    }
    return;
  }

  if (action === "move-down") {
    const moved = moveField(source, index, 1);
    if (editorType === "global") {
      globalFieldConfig = moved;
      renderFieldEditor(globalFieldList, globalFieldConfig, "global");
    } else {
      campaignFieldConfig = moved;
      renderFieldEditor(campaignFieldList, campaignFieldConfig, "campaign");
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

function renderGlobalFieldEditor() {
  renderFieldEditor(globalFieldList, globalFieldConfig, "global");
}

function renderCampaignFieldEditor() {
  renderFieldEditor(campaignFieldList, campaignFieldConfig, "campaign");
}

function buildLabelMapFromConfig(fieldConfig, customFields) {
  const map = new Map();
  for (const field of fieldConfig) {
    map.set(field.key, field.label || field.key);
  }
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

function populateCampaignSettings() {
  const campaign = getSelectedCampaign();

  if (!campaign) {
    campaignSettingsForm.reset();
    campaignFieldConfig = [];
    renderCampaignFieldEditor();
    disableCampaignSettings(true);
    return;
  }

  disableCampaignSettings(false);
  settingsTitle.value = campaign.title || "";
  settingsDescription.value = campaign.description || "";
  settingsNotice.value = campaign.notice || "";
  settingsIsActive.checked = Boolean(campaign.is_active);
  settingsCustomFields.value = JSON.stringify(campaign.custom_fields, null, 2);

  campaignFieldConfig = mergeFieldConfig(campaign.field_config, globalFieldConfig, campaign.custom_fields);
  renderCampaignFieldEditor();
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
    applyEditorAction(editorType, index, action, target);
    return;
  }

  if (event.type === "input" || event.type === "change") {
    applyEditorAction(editorType, index, action, target);
  }
}

async function requireSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function requireAdminUser() {
  const supabase = getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.email) return null;

  const { data, error } = await supabase
    .from("admins")
    .select("email")
    .eq("email", user.email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadGlobalFieldConfig() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
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
  const supabase = getSupabase();
  const normalized = mergeFieldConfig(globalFieldConfig, buildBaseFixedFieldConfig(), []);
  globalFieldConfig = normalized;

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_KEY,
      value: {
        field_config: normalized,
      },
    },
    { onConflict: "key" },
  );

  if (error) throw error;
  renderGlobalFieldEditor();
}

async function loadCampaignsForAdmin() {
  const supabase = getSupabase();
  const previousSelected = adminCampaignFilter.value;

  let { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, title, description, notice, is_active, custom_fields, field_config")
    .order("created_at", { ascending: false });

  if (error && /field_config/i.test(error.message || "")) {
    const fallback = await supabase
      .from("campaigns")
      .select("id, slug, title, description, notice, is_active, custom_fields")
      .order("created_at", { ascending: false });
    data = (fallback.data || []).map((campaign) => ({ ...campaign, field_config: [] }));
    error = fallback.error;
  }

  if (error) throw error;

  activeCampaigns = (data || []).map((campaign) => ({
    ...campaign,
    custom_fields: normalizeCustomFields(campaign.custom_fields),
    field_config: normalizeFieldConfig(campaign.field_config),
  }));

  if (!activeCampaigns.length) {
    adminCampaignFilter.innerHTML = '<option value="">目前沒有活動</option>';
    ordersHead.innerHTML = "";
    ordersBody.innerHTML = "";
    disableCampaignSettings(true);
    campaignFieldConfig = [];
    renderCampaignFieldEditor();
    return;
  }

  adminCampaignFilter.innerHTML = activeCampaigns
    .map((campaign) => `<option value="${campaign.id}">${escapeHtml(campaign.title)}${campaign.is_active ? "" : " (停用)"}</option>`)
    .join("");

  if (activeCampaigns.some((campaign) => campaign.id === previousSelected)) {
    adminCampaignFilter.value = previousSelected;
  }

  populateCampaignSettings();
}

function renderOrdersHeader(campaign) {
  const customFields = campaign?.custom_fields || [];
  const labelMap = buildLabelMapFromConfig(campaignFieldConfig, customFields);

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
    const options = field.options
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

function renderStatusSelect(order) {
  return `<select class="status-select" data-order-id="${order.id}" data-field="status">${STATUS_OPTIONS.map(
    (status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`,
  ).join("")}</select>`;
}

function renderTransactionMethodSelect(order) {
  return `<select data-order-id="${order.id}" data-field="transaction_method">${TRANSACTION_METHOD_OPTIONS.map(
    (method) => `<option value="${method}" ${method === order.transaction_method ? "selected" : ""}>${method}</option>`,
  ).join("")}</select>`;
}

function renderOrders(rows) {
  const campaign = getSelectedCampaign();
  const customFields = campaign?.custom_fields || [];
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
          <td>${renderStatusSelect(order)}</td>
          <td><button type="button" data-action="update" data-order-id="${order.id}">儲存</button></td>
          <td><button type="button" data-action="delete" data-order-id="${order.id}">刪除</button></td>
        </tr>
      `;
    })
    .join("");
}

async function loadOrders() {
  const campaignId = adminCampaignFilter.value;
  if (!campaignId) {
    currentOrders = [];
    renderOrders(currentOrders);
    return;
  }

  const supabase = getSupabase();
  const selectedCampaign = getSelectedCampaign();

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
  return ordersBody.querySelector(`[data-order-id="${orderId}"][data-field="${field}"]`);
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

  if (!customerName) throw new Error("姓名不可空白");
  if (!phone) throw new Error("手機不可空白");
  if (!email) throw new Error("Email 不可空白");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("數量需為正整數");
  if (!transferAccount) throw new Error("匯款帳號不可空白");
  if (!transferTime) throw new Error("匯款時間格式錯誤");
  if (!TRANSACTION_METHOD_OPTIONS.includes(transactionMethod)) throw new Error("交易方式錯誤");
  if (!STATUS_OPTIONS.includes(status)) throw new Error("狀態錯誤");

  const campaign = getSelectedCampaign();
  const customFields = campaign?.custom_fields || [];
  const extraData = { ...(baseOrder.extra_data || {}) };

  for (const field of customFields) {
    const element = ordersBody.querySelector(`[data-order-id="${orderId}"][data-custom-key="${field.key}"]`);
    if (!element) continue;
    const value = element.value?.trim?.() ?? "";
    extraData[field.key] = value;
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
  const supabase = getSupabase();
  const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
  if (error) throw error;
}

async function deleteOrder(orderId) {
  const supabase = getSupabase();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

function toCsvText(rows, campaign) {
  const customFields = campaign?.custom_fields || [];
  const labelMap = buildLabelMapFromConfig(campaignFieldConfig, customFields);

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

  const escapeCell = (value) => {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
  };

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

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(authMessage, "登入中...");

  try {
    const supabase = getSupabase();
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
    await loadGlobalFieldConfig();
    await loadCampaignsForAdmin();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `登入失敗：${error.message}`, "error");
  }
});

globalDefaultsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(globalMessage, "儲存中...");

  try {
    await saveGlobalFieldConfig();
    await loadCampaignsForAdmin();
    setMessage(globalMessage, "全域預設已更新，新活動會套用。", "success");
  } catch (error) {
    setMessage(globalMessage, `儲存失敗：${error.message}`, "error");
  }
});

campaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(campaignMessage, "建立中...");

  try {
    const supabase = getSupabase();
    const title = document.querySelector("#campaign-title").value.trim();
    const description = document.querySelector("#campaign-description").value.trim();
    const notice = document.querySelector("#campaign-notice").value.trim();
    const customFields = parseCustomFieldsJson(document.querySelector("#campaign-custom-fields").value);

    if (!title) throw new Error("請輸入活動標題");

    const slug = generateCampaignSlug(title);
    const fieldConfig = mergeFieldConfig([], globalFieldConfig, customFields);

    let { data, error } = await supabase
      .from("campaigns")
      .insert({
        slug,
        title,
        description,
        notice,
        custom_fields: customFields,
        field_config: fieldConfig,
        is_active: true,
      })
      .select("id")
      .single();

    if (error && /field_config/i.test(error.message || "")) {
      const fallback = await supabase
        .from("campaigns")
        .insert({
          slug,
          title,
          description,
          notice,
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
    if (data?.id) {
      adminCampaignFilter.value = data.id;
      populateCampaignSettings();
      await loadOrders();
    }
  } catch (error) {
    setMessage(campaignMessage, `建立失敗：${error.message}`, "error");
  }
});

campaignSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(ordersMessage, "活動設定儲存中...");

  try {
    const supabase = getSupabase();
    const campaign = getSelectedCampaign();
    if (!campaign) throw new Error("請先選擇活動");

    const title = settingsTitle.value.trim();
    const description = settingsDescription.value.trim();
    const notice = settingsNotice.value.trim();
    const isActive = settingsIsActive.checked;

    const parsedCustomFields = parseCustomFieldsJson(settingsCustomFields.value);

    if (!title) throw new Error("活動標題不可空白");

    const normalizedFieldConfig = mergeFieldConfig(campaignFieldConfig, globalFieldConfig, parsedCustomFields);
    campaignFieldConfig = normalizedFieldConfig;

    let { error } = await supabase
      .from("campaigns")
      .update({
        title,
        description,
        notice,
        is_active: isActive,
        custom_fields: parsedCustomFields,
        field_config: normalizedFieldConfig,
      })
      .eq("id", campaign.id);

    if (error && /field_config/i.test(error.message || "")) {
      const fallback = await supabase
        .from("campaigns")
        .update({
          title,
          description,
          notice,
          is_active: isActive,
          custom_fields: parsedCustomFields,
        })
        .eq("id", campaign.id);
      error = fallback.error;
    }

    if (error) throw error;

    await loadCampaignsForAdmin();
    adminCampaignFilter.value = campaign.id;
    populateCampaignSettings();
    await loadOrders();
    setMessage(ordersMessage, "活動設定已更新。", "success");
  } catch (error) {
    setMessage(ordersMessage, `活動設定更新失敗：${error.message}`, "error");
  }
});

settingsCustomFields.addEventListener("input", () => {
  try {
    const parsed = parseCustomFieldsJson(settingsCustomFields.value);
    campaignFieldConfig = mergeFieldConfig(campaignFieldConfig, globalFieldConfig, parsed);
    renderCampaignFieldEditor();
  } catch {
    // Skip while JSON is mid-edit.
  }
});

globalFieldList.addEventListener("click", setFieldEditorFromEvent);
globalFieldList.addEventListener("input", setFieldEditorFromEvent);
globalFieldList.addEventListener("change", setFieldEditorFromEvent);

campaignFieldList.addEventListener("click", setFieldEditorFromEvent);
campaignFieldList.addEventListener("input", setFieldEditorFromEvent);
campaignFieldList.addEventListener("change", setFieldEditorFromEvent);

reloadOrdersBtn.addEventListener("click", async () => {
  setMessage(ordersMessage, "載入中...");
  try {
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setMessage(ordersMessage, `載入失敗：${error.message}`, "error");
  }
});

adminCampaignFilter.addEventListener("change", async () => {
  setMessage(ordersMessage, "載入中...");
  try {
    populateCampaignSettings();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setMessage(ordersMessage, `載入失敗：${error.message}`, "error");
  }
});

ordersBody.addEventListener("click", async (event) => {
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
      setMessage(ordersMessage, "訂單內容已更新。", "success");
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
      setMessage(ordersMessage, "訂單已刪除。", "success");
    } catch (error) {
      setMessage(ordersMessage, `刪除失敗：${error.message}`, "error");
    }
  }
});

exportCsvBtn.addEventListener("click", async () => {
  try {
    if (!currentOrders.length) {
      setMessage(ordersMessage, "目前無資料可匯出");
      return;
    }

    const campaign = getSelectedCampaign();
    const safeSlug = campaign?.slug || "orders";
    const csv = toCsvText(currentOrders, campaign);
    downloadCsv(`${safeSlug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setMessage(ordersMessage, "CSV 匯出完成。", "success");
  } catch (error) {
    setMessage(ordersMessage, `匯出失敗：${error.message}`, "error");
  }
});

logoutBtn.addEventListener("click", async () => {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  setSignedInState(false);
  setMessage(authMessage, "已登出");
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
      const supabase = getSupabase();
      await supabase.auth.signOut();
      setSignedInState(false);
      setMessage(authMessage, "此帳號沒有管理權限，請使用管理員帳號登入。", "error");
      return;
    }

    setSignedInState(true);
    await loadGlobalFieldConfig();
    await loadCampaignsForAdmin();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `管理頁初始化失敗：${error.message}`, "error");
  }
})();
