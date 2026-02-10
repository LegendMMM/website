import { getSupabase } from "./supabaseClient.js";

const STATUS_DEFAULT = "已匯款";

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
    source: "fixed",
  },
  {
    key: "phone",
    label: "手機",
    type: "tel",
    required: true,
    visible: true,
    placeholder: "例如 0912345678",
    source: "fixed",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    visible: true,
    placeholder: "",
    source: "fixed",
  },
  {
    key: "quantity",
    label: "數量",
    type: "number",
    required: true,
    visible: true,
    placeholder: "",
    source: "fixed",
  },
  {
    key: "transfer_account",
    label: "匯款帳號",
    type: "text",
    required: true,
    visible: true,
    placeholder: "例如 12345 或 完整帳號",
    source: "fixed",
  },
  {
    key: "transfer_time",
    label: "匯款時間",
    type: "datetime-local",
    required: true,
    visible: true,
    placeholder: "",
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
    source: "fixed",
  },
];

const orderForm = document.querySelector("#order-form");
const orderFieldsContainer = document.querySelector("#order-fields-container");
const queryForm = document.querySelector("#query-form");
const orderFormMessage = document.querySelector("#order-form-message");
const queryMessage = document.querySelector("#query-message");
const orderCampaignSelect = document.querySelector("#campaign-id");
const queryCampaignSelect = document.querySelector("#query-campaign-slug");
const queryResultsBody = document.querySelector("#query-results");
const campaignDescriptionDisplay = document.querySelector("#campaign-description-display");
const campaignNotice = document.querySelector("#campaign-notice");
const entryHub = document.querySelector("#entry-hub");
const orderPanel = document.querySelector("#order-panel");
const queryPanel = document.querySelector("#query-panel");
const orderStep1 = document.querySelector("#order-step-1");
const orderStep2 = document.querySelector("#order-step-2");
const stepIndicators = document.querySelectorAll("[data-step-indicator]");
const entryOrderBtn = document.querySelector("#entry-order-btn");
const entryQueryBtn = document.querySelector("#entry-query-btn");
const backToHubFromOrderBtn = document.querySelector("#back-to-hub-from-order");
const backToHubFromQueryBtn = document.querySelector("#back-to-hub-from-query");
const goToStep2Btn = document.querySelector("#go-to-step-2");
const backToStep1Btn = document.querySelector("#back-to-step-1");

let campaigns = [];
let defaultFieldConfig = buildBaseFixedFieldConfig();
let activeFieldConfig = [];

function setMessage(el, text, type = "") {
  el.textContent = text;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

function setActivePanel(panel) {
  entryHub.classList.toggle("hidden", panel !== "hub");
  orderPanel.classList.toggle("hidden", panel !== "order");
  queryPanel.classList.toggle("hidden", panel !== "query");
}

function setOrderStep(step) {
  const isStep1 = step === 1;
  orderStep1.classList.toggle("hidden", !isStep1);
  orderStep2.classList.toggle("hidden", isStep1);

  for (const item of stepIndicators) {
    item.classList.toggle("active", Number(item.dataset.stepIndicator) === step);
  }
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
  return (input || "").replace(/\D/g, "");
}

function toLocalISO(dateTimeLocalValue) {
  const date = new Date(dateTimeLocalValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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
        ? field.options.map((item) => String(item).trim()).filter(Boolean)
        : [];

      return {
        key,
        label,
        type,
        required,
        options,
      };
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

function buildCampaignFieldConfig(campaign) {
  const customFields = normalizeCustomFields(campaign.custom_fields);
  const existingConfig = normalizeFieldConfig(campaign.field_config);
  const fixedDefaults = defaultFieldConfig;

  const fixedDefaultMap = new Map(fixedDefaults.map((field) => [field.key, field]));
  const customDefaultMap = new Map(
    customFields.map((field) => [
      field.key,
      {
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        visible: true,
        placeholder: "",
        options: field.options,
        source: "custom",
      },
    ]),
  );

  const allowedKeys = new Set([...fixedDefaultMap.keys(), ...customDefaultMap.keys()]);
  const result = [];
  const usedKeys = new Set();

  for (const existingField of existingConfig) {
    if (!allowedKeys.has(existingField.key)) continue;

    const fixedDefault = fixedDefaultMap.get(existingField.key);
    const customDefault = customDefaultMap.get(existingField.key);

    let merged;
    if (fixedDefault) {
      merged = {
        ...fixedDefault,
        ...existingField,
        key: fixedDefault.key,
        source: "fixed",
        type: fixedDefault.type,
        options: [...(fixedDefault.options || [])],
      };
    } else if (customDefault) {
      merged = {
        ...customDefault,
        ...existingField,
        key: customDefault.key,
        source: "custom",
        type: customDefault.type,
        options: [...(customDefault.options || [])],
      };
    } else {
      continue;
    }

    if (PROTECTED_REQUIRED_KEYS.has(merged.key)) {
      merged.required = true;
      merged.visible = true;
    }

    result.push(merged);
    usedKeys.add(merged.key);
  }

  for (const fixedField of fixedDefaults) {
    if (usedKeys.has(fixedField.key)) continue;
    result.push({ ...fixedField, options: [...(fixedField.options || [])] });
    usedKeys.add(fixedField.key);
  }

  for (const customField of customFields) {
    if (usedKeys.has(customField.key)) continue;
    result.push({
      key: customField.key,
      label: customField.label,
      type: customField.type,
      required: customField.required,
      visible: true,
      placeholder: "",
      options: [...(customField.options || [])],
      source: "custom",
    });
    usedKeys.add(customField.key);
  }

  return result;
}

function getSelectedCampaign() {
  return campaigns.find((campaign) => campaign.id === orderCampaignSelect.value) || null;
}

function getVisibleFieldConfig() {
  return activeFieldConfig.filter((field) => field.visible !== false);
}

function renderCampaignInfo() {
  const campaign = getSelectedCampaign();
  const descriptionText = String(campaign?.description || "").trim();
  const noticeText = String(campaign?.notice || "").trim();

  campaignDescriptionDisplay.textContent = descriptionText || "此活動目前沒有活動說明。";
  campaignNotice.textContent = noticeText || "此活動目前沒有額外注意事項。";
}

function renderFieldInput(field) {
  const requiredMark = field.required ? " *" : "";
  const safeLabel = escapeHtml(`${field.label}${requiredMark}`);
  const safeKey = escapeHtml(field.key);
  const requiredAttr = field.required ? "required" : "";
  const placeholder = escapeHtml(field.placeholder || "");

  if (field.type === "textarea") {
    return `
      <label>
        ${safeLabel}
        <textarea data-order-field-key="${safeKey}" rows="3" placeholder="${placeholder}" ${requiredAttr}></textarea>
      </label>
    `;
  }

  if (field.type === "select") {
    const options = (field.options || []).length ? field.options : [""];
    const optionHtml = options
      .map((option, index) => {
        const selected = field.key === "transaction_method" && index === 0 ? "selected" : "";
        return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option || "請選擇")}</option>`;
      })
      .join("");

    return `
      <label>
        ${safeLabel}
        <select data-order-field-key="${safeKey}" ${requiredAttr}>${optionHtml}</select>
      </label>
    `;
  }

  const inputType = ["text", "tel", "email", "number", "datetime-local"].includes(field.type)
    ? field.type
    : "text";
  const extraAttrs = field.key === "quantity" ? 'min="1" value="1"' : "";

  return `
    <label>
      ${safeLabel}
      <input data-order-field-key="${safeKey}" type="${inputType}" placeholder="${placeholder}" ${requiredAttr} ${extraAttrs} />
    </label>
  `;
}

function renderOrderFields() {
  const visibleFields = getVisibleFieldConfig();
  if (!visibleFields.length) {
    orderFieldsContainer.innerHTML = '<p class="hint">此活動目前沒有可填欄位。</p>';
    return;
  }

  orderFieldsContainer.innerHTML = visibleFields.map((field) => renderFieldInput(field)).join("");
}

function renderCampaignOptions() {
  if (!campaigns.length) {
    orderCampaignSelect.innerHTML = '<option value="">目前沒有活動</option>';
    queryCampaignSelect.innerHTML = '<option value="">目前沒有活動</option>';
    orderFieldsContainer.innerHTML = "";
    campaignDescriptionDisplay.textContent = "目前沒有可報名活動。";
    campaignNotice.textContent = "目前沒有可報名活動。";
    return;
  }

  const previousOrderCampaign = orderCampaignSelect.value;
  const previousQueryCampaign = queryCampaignSelect.value;

  orderCampaignSelect.innerHTML = campaigns
    .map((campaign) => `<option value="${campaign.id}">${escapeHtml(campaign.title)}</option>`)
    .join("");

  queryCampaignSelect.innerHTML = campaigns
    .map((campaign) => `<option value="${campaign.slug}">${escapeHtml(campaign.title)}</option>`)
    .join("");

  if (campaigns.some((campaign) => campaign.id === previousOrderCampaign)) {
    orderCampaignSelect.value = previousOrderCampaign;
  }

  if (campaigns.some((campaign) => campaign.slug === previousQueryCampaign)) {
    queryCampaignSelect.value = previousQueryCampaign;
  }

  const selectedCampaign = getSelectedCampaign();
  activeFieldConfig = selectedCampaign ? buildCampaignFieldConfig(selectedCampaign) : [];
  renderOrderFields();
  renderCampaignInfo();
}

async function loadDefaultFieldConfig() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "order_form_defaults")
    .maybeSingle();

  if (error) {
    defaultFieldConfig = buildBaseFixedFieldConfig();
    return;
  }

  const loaded = normalizeFieldConfig(data?.value?.field_config);
  if (!loaded.length) {
    defaultFieldConfig = buildBaseFixedFieldConfig();
    return;
  }

  const defaultMap = new Map(loaded.map((field) => [field.key, field]));
  defaultFieldConfig = buildBaseFixedFieldConfig().map((baseField) => {
    const override = defaultMap.get(baseField.key);
    const merged = {
      ...baseField,
      ...(override || {}),
      key: baseField.key,
      type: baseField.type,
      options: [...(baseField.options || [])],
      source: "fixed",
    };

    if (PROTECTED_REQUIRED_KEYS.has(merged.key)) {
      merged.required = true;
      merged.visible = true;
    }

    return merged;
  });
}

async function loadCampaigns() {
  const supabase = getSupabase();
  let query = supabase
    .from("campaigns")
    .select("id, slug, title, description, notice, custom_fields, field_config")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  let { data, error } = await query;

  if (error && /field_config/i.test(error.message || "")) {
    const fallback = await supabase
      .from("campaigns")
      .select("id, slug, title, description, notice, custom_fields")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    data = (fallback.data || []).map((campaign) => ({ ...campaign, field_config: [] }));
    error = fallback.error;
  }

  if (error) throw error;

  campaigns = (data || []).map((campaign) => ({
    ...campaign,
    custom_fields: normalizeCustomFields(campaign.custom_fields),
    field_config: normalizeFieldConfig(campaign.field_config),
  }));

  renderCampaignOptions();
}

function collectVisibleFieldValues() {
  const values = {};
  const elements = orderFieldsContainer.querySelectorAll("[data-order-field-key]");

  for (const element of elements) {
    const key = element.getAttribute("data-order-field-key");
    if (!key) continue;
    values[key] = element.value?.trim?.() ?? "";
  }

  return values;
}

function validateVisibleRequiredFields(visibleFields, values) {
  for (const field of visibleFields) {
    if (!field.required) continue;
    if (String(values[field.key] || "").trim() === "") {
      throw new Error(`請輸入「${field.label}」`);
    }
  }
}

function buildOrderInsertPayload(campaignId, values) {
  const quantity = Number(values.quantity);
  const transferTime = toLocalISO(values.transfer_time);

  if (!values.customer_name) throw new Error("請輸入姓名");
  if (!values.phone) throw new Error("請輸入手機");
  if (!values.email) throw new Error("請輸入 Email");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("請輸入正確數量");
  if (!values.transfer_account) throw new Error("請輸入匯款帳號");
  if (!transferTime) throw new Error("請輸入正確的匯款時間");
  if (!["面交", "賣貨便"].includes(values.transaction_method)) {
    throw new Error("交易方式錯誤");
  }

  const extraData = {};
  for (const field of activeFieldConfig) {
    if (field.source !== "custom") continue;
    extraData[field.key] = values[field.key] ?? "";
  }

  const fieldSnapshot = activeFieldConfig.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    visible: field.visible !== false,
    placeholder: field.placeholder || "",
    options: Array.isArray(field.options) ? field.options : [],
    source: field.source === "custom" ? "custom" : "fixed",
  }));

  return {
    campaign_id: campaignId,
    customer_name: values.customer_name,
    phone: values.phone,
    email: values.email,
    quantity,
    transfer_account: values.transfer_account,
    transfer_time: transferTime,
    transaction_method: values.transaction_method,
    note: values.note || "",
    extra_data: extraData,
    field_snapshot: fieldSnapshot,
    status: STATUS_DEFAULT,
  };
}

function renderQueryResults(rows) {
  if (!rows.length) {
    queryResultsBody.innerHTML = "";
    return;
  }

  queryResultsBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.campaign_title)}</td>
        <td>${escapeHtml(row.customer_name)}</td>
        <td>${row.quantity}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${formatDate(row.submitted_at)}</td>
      </tr>
    `,
    )
    .join("");
}

entryOrderBtn.addEventListener("click", () => {
  setActivePanel("order");
  setOrderStep(1);
});

entryQueryBtn.addEventListener("click", () => {
  setActivePanel("query");
});

backToHubFromOrderBtn.addEventListener("click", () => {
  setActivePanel("hub");
  setOrderStep(1);
});

backToHubFromQueryBtn.addEventListener("click", () => {
  setActivePanel("hub");
});

goToStep2Btn.addEventListener("click", () => {
  if (!orderCampaignSelect.value) {
    setMessage(orderFormMessage, "請先選擇活動再繼續。", "error");
    return;
  }

  setMessage(orderFormMessage, "");
  setOrderStep(2);
});

backToStep1Btn.addEventListener("click", () => {
  setOrderStep(1);
});

orderCampaignSelect.addEventListener("change", () => {
  const selectedCampaign = getSelectedCampaign();
  activeFieldConfig = selectedCampaign ? buildCampaignFieldConfig(selectedCampaign) : [];
  renderOrderFields();
  renderCampaignInfo();
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(orderFormMessage, "送出中...");

  try {
    const campaignId = orderCampaignSelect.value;
    if (!campaignId) throw new Error("目前沒有可訂購活動");

    const visibleFields = getVisibleFieldConfig();
    const values = collectVisibleFieldValues();
    validateVisibleRequiredFields(visibleFields, values);

    const payload = buildOrderInsertPayload(campaignId, values);
    const supabase = getSupabase();
    let { error } = await supabase.from("orders").insert(payload);

    if (error && /field_snapshot/i.test(error.message || "")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.field_snapshot;
      const fallback = await supabase.from("orders").insert(fallbackPayload);
      error = fallback.error;
    }

    if (error) throw error;

    const selectedCampaign = getSelectedCampaign();
    activeFieldConfig = selectedCampaign ? buildCampaignFieldConfig(selectedCampaign) : [];
    renderOrderFields();
    renderCampaignInfo();
    setOrderStep(1);
    setMessage(orderFormMessage, "送出成功，請保留姓名或電話以便查詢。", "success");
  } catch (error) {
    setMessage(orderFormMessage, `送出失敗：${error.message}`, "error");
  }
});

queryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(queryMessage, "查詢中...");
  queryResultsBody.innerHTML = "";

  try {
    const supabase = getSupabase();
    const campaignSlug = queryCampaignSelect.value;
    const customerName = document.querySelector("#query-name").value.trim();
    const phoneDigits = digitsOnly(document.querySelector("#query-phone").value);

    if (!campaignSlug) throw new Error("請先選擇活動");
    if (!customerName && !phoneDigits) throw new Error("姓名或電話至少填一項");
    if (phoneDigits && phoneDigits.length < 3) throw new Error("若要用電話查詢，請至少輸入 3 碼");

    const { data, error } = await supabase.rpc("search_order_status", {
      p_campaign_slug: campaignSlug,
      p_query_name: customerName || null,
      p_query_phone: phoneDigits || null,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      setMessage(queryMessage, "查無資料，請確認活動與姓名或電話是否正確。");
      return;
    }

    renderQueryResults(data);
    setMessage(queryMessage, `查詢成功，共 ${data.length} 筆。`, "success");
  } catch (error) {
    setMessage(queryMessage, `查詢失敗：${error.message}`, "error");
  }
});

(async function bootstrap() {
  try {
    setActivePanel("hub");
    setOrderStep(1);
    await loadDefaultFieldConfig();
    await loadCampaigns();
  } catch (error) {
    setMessage(orderFormMessage, `初始化失敗：${error.message}`, "error");
    setMessage(queryMessage, `初始化失敗：${error.message}`, "error");
  }
})();
