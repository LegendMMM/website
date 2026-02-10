import { getSupabase } from "./supabaseClient.js";

const STATUS_OPTIONS = ["已匯款", "已採購", "已到貨", "已完成"];
const TRANSACTION_METHOD_OPTIONS = ["面交", "賣貨便"];

const authPanel = document.querySelector("#auth-panel");
const adminPanel = document.querySelector("#admin-panel");
const authMessage = document.querySelector("#auth-message");
const campaignMessage = document.querySelector("#campaign-message");
const ordersMessage = document.querySelector("#orders-message");

const loginForm = document.querySelector("#login-form");
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
const fieldLabelList = document.querySelector("#field-label-list");

let activeCampaigns = [];
let currentOrders = [];

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

function normalizeCustomFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];

  const normalized = [];
  for (const field of rawFields) {
    if (!field || typeof field !== "object") continue;

    const key = String(field.key || "").trim();
    const label = String(field.label || key || "").trim();
    const type = String(field.type || "text").trim();
    const required = Boolean(field.required);
    const options = Array.isArray(field.options)
      ? field.options.map((option) => String(option).trim()).filter(Boolean)
      : [];

    if (!key) continue;

    normalized.push({
      key,
      label,
      type,
      required,
      options,
    });
  }

  return normalized;
}

function parseCustomFieldsInput(inputText) {
  const text = String(inputText || "").trim();
  if (!text) return [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("自訂欄位 JSON 格式錯誤");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("自訂欄位必須是 JSON 陣列");
  }

  const normalized = normalizeCustomFields(parsed);
  if (normalized.length !== parsed.length) {
    throw new Error("自訂欄位格式不完整，請確認每個欄位都有 key");
  }

  const seen = new Set();
  for (const field of normalized) {
    if (!/^[a-zA-Z0-9_]+$/.test(field.key)) {
      throw new Error(`欄位 key 只能用英數或底線：${field.key}`);
    }

    if (seen.has(field.key)) {
      throw new Error(`欄位 key 重複：${field.key}`);
    }
    seen.add(field.key);

    if (!["text", "number", "textarea", "select"].includes(field.type)) {
      throw new Error(`欄位 type 不支援：${field.type}`);
    }

    if (field.type === "select" && field.options.length === 0) {
      throw new Error(`select 欄位需提供 options：${field.key}`);
    }
  }

  return normalized;
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

function renderFieldLabelEditor(customFields) {
  if (!customFields.length) {
    fieldLabelList.innerHTML = '<p class="hint">此活動沒有自訂欄位。</p>';
    return;
  }

  fieldLabelList.innerHTML = customFields
    .map(
      (field) => `
      <div class="field-label-row">
        <span class="field-key">key: ${escapeHtml(field.key)} | type: ${escapeHtml(field.type)}</span>
        <label>
          欄位名稱
          <input type="text" data-label-key="${escapeHtml(field.key)}" value="${escapeHtml(field.label)}" />
        </label>
      </div>
    `,
    )
    .join("");
}

function populateCampaignSettings() {
  const campaign = getSelectedCampaign();

  if (!campaign) {
    campaignSettingsForm.reset();
    fieldLabelList.innerHTML = "";
    disableCampaignSettings(true);
    return;
  }

  const customFields = normalizeCustomFields(campaign.custom_fields);

  disableCampaignSettings(false);
  settingsTitle.value = campaign.title || "";
  settingsDescription.value = campaign.description || "";
  settingsNotice.value = campaign.notice || "";
  settingsIsActive.checked = Boolean(campaign.is_active);
  settingsCustomFields.value = JSON.stringify(customFields, null, 2);
  renderFieldLabelEditor(customFields);
}

function syncLabelToCustomFieldsJson(fieldKey, labelValue) {
  let fields;
  try {
    fields = parseCustomFieldsInput(settingsCustomFields.value);
  } catch {
    return;
  }

  fields = fields.map((field) => (field.key === fieldKey ? { ...field, label: String(labelValue || "").trim() || field.key } : field));
  settingsCustomFields.value = JSON.stringify(fields, null, 2);
}

function tryRefreshFieldLabelEditor() {
  try {
    const fields = parseCustomFieldsInput(settingsCustomFields.value);
    renderFieldLabelEditor(fields);
  } catch {
    // Keep current editor while JSON is temporarily invalid during typing.
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

async function loadCampaignsForAdmin() {
  const supabase = getSupabase();
  const previousSelected = adminCampaignFilter.value;

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, title, description, notice, is_active, custom_fields")
    .order("created_at", { ascending: false });

  if (error) throw error;

  activeCampaigns = data || [];
  if (!activeCampaigns.length) {
    adminCampaignFilter.innerHTML = '<option value="">目前沒有活動</option>';
    ordersHead.innerHTML = "";
    ordersBody.innerHTML = "";
    disableCampaignSettings(true);
    fieldLabelList.innerHTML = "";
    return;
  }

  adminCampaignFilter.innerHTML = activeCampaigns
    .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}${c.is_active ? "" : " (停用)"}</option>`)
    .join("");

  if (activeCampaigns.some((c) => c.id === previousSelected)) {
    adminCampaignFilter.value = previousSelected;
  }

  populateCampaignSettings();
}

function renderOrdersHeader(customFields) {
  const customHeaders = customFields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join("");

  ordersHead.innerHTML = `
    <tr>
      <th>姓名</th>
      <th>手機</th>
      <th>Email</th>
      <th>數量</th>
      <th>匯款帳號</th>
      <th>匯款時間</th>
      <th>交易方式</th>
      ${customHeaders}
      <th>備註</th>
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
  const customFields = normalizeCustomFields(campaign?.custom_fields);
  renderOrdersHeader(customFields);

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
  const customFields = normalizeCustomFields(campaign?.custom_fields);
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

function toCsvText(rows, customFields) {
  const headers = [
    "活動",
    "姓名",
    "手機",
    "Email",
    "數量",
    "匯款帳號",
    "匯款時間",
    "交易方式",
    ...customFields.map((field) => field.label),
    "備註",
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    const adminRow = await requireAdminUser();
    if (!adminRow) {
      await supabase.auth.signOut();
      throw new Error("此帳號沒有管理權限");
    }

    setSignedInState(true);
    await loadCampaignsForAdmin();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `登入失敗：${error.message}`, "error");
  }
});

campaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(campaignMessage, "建立中...");

  try {
    const supabase = getSupabase();
    const slug = document.querySelector("#campaign-slug").value.trim();
    const title = document.querySelector("#campaign-title").value.trim();
    const description = document.querySelector("#campaign-description").value.trim();
    const notice = document.querySelector("#campaign-notice").value.trim();
    const customFieldsText = document.querySelector("#campaign-custom-fields").value;
    const customFields = parseCustomFieldsInput(customFieldsText);

    if (!slug || !title) throw new Error("請輸入活動代碼與標題");

    const { data, error } = await supabase
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

    if (error) throw error;

    campaignForm.reset();
    setMessage(campaignMessage, "活動建立完成。", "success");
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
    const customFields = parseCustomFieldsInput(settingsCustomFields.value);

    if (!title) throw new Error("活動標題不可空白");

    const { error } = await supabase
      .from("campaigns")
      .update({
        title,
        description,
        notice,
        is_active: isActive,
        custom_fields: customFields,
      })
      .eq("id", campaign.id);

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
  tryRefreshFieldLabelEditor();
});

fieldLabelList.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  const key = target.dataset.labelKey;
  if (!key) return;
  syncLabelToCustomFieldsJson(key, target.value);
});

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
    const customFields = normalizeCustomFields(campaign?.custom_fields);
    const safeSlug = campaign?.slug || "orders";
    const csv = toCsvText(currentOrders, customFields);
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
    await loadCampaignsForAdmin();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `管理頁初始化失敗：${error.message}`, "error");
  }
})();
