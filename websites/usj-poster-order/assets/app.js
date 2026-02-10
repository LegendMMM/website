import { getSupabase } from "./supabaseClient.js";

const STATUS_DEFAULT = "已匯款";

const orderForm = document.querySelector("#order-form");
const queryForm = document.querySelector("#query-form");
const orderFormMessage = document.querySelector("#order-form-message");
const queryMessage = document.querySelector("#query-message");
const orderCampaignSelect = document.querySelector("#campaign-id");
const queryCampaignSelect = document.querySelector("#query-campaign-slug");
const queryResultsBody = document.querySelector("#query-results");
const customFieldsContainer = document.querySelector("#custom-fields-container");

let campaigns = [];

function setMessage(el, text, type = "") {
  el.textContent = text;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
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

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCustomFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];

  return rawFields
    .map((field) => {
      if (!field || typeof field !== "object") return null;
      const key = String(field.key || "").trim();
      const label = String(field.label || key || "").trim();
      const type = String(field.type || "text").trim();
      const required = Boolean(field.required);
      const options = Array.isArray(field.options)
        ? field.options.map((item) => String(item).trim()).filter(Boolean)
        : [];

      if (!key) return null;
      return { key, label, type, required, options };
    })
    .filter(Boolean);
}

function getSelectedCampaign() {
  return campaigns.find((campaign) => campaign.id === orderCampaignSelect.value) || null;
}

function renderCustomFields() {
  const campaign = getSelectedCampaign();
  const customFields = normalizeCustomFields(campaign?.custom_fields);

  if (!customFields.length) {
    customFieldsContainer.innerHTML = "";
    return;
  }

  customFieldsContainer.innerHTML = customFields
    .map((field) => {
      const reqAttr = field.required ? "required" : "";
      const requiredMark = field.required ? " *" : "";
      const safeKey = escapeHtml(field.key);
      const safeLabel = escapeHtml(field.label + requiredMark);

      if (field.type === "textarea") {
        return `
          <label>
            ${safeLabel}
            <textarea data-custom-key="${safeKey}" rows="3" ${reqAttr}></textarea>
          </label>
        `;
      }

      if (field.type === "select") {
        const options = field.options.length ? field.options : [""];
        const optionHtml = options
          .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option || "請選擇")}</option>`)
          .join("");
        return `
          <label>
            ${safeLabel}
            <select data-custom-key="${safeKey}" ${reqAttr}>${optionHtml}</select>
          </label>
        `;
      }

      const inputType = field.type === "number" ? "number" : "text";
      return `
        <label>
          ${safeLabel}
          <input data-custom-key="${safeKey}" type="${inputType}" ${reqAttr} />
        </label>
      `;
    })
    .join("");
}

function collectCustomFieldValues() {
  const values = {};
  const elements = customFieldsContainer.querySelectorAll("[data-custom-key]");

  for (const element of elements) {
    const key = element.getAttribute("data-custom-key");
    if (!key) continue;
    const value = element.value?.trim?.() ?? "";
    values[key] = value;
  }

  return values;
}

function renderCampaignOptions() {
  if (!campaigns.length) {
    orderCampaignSelect.innerHTML = '<option value="">目前沒有活動</option>';
    queryCampaignSelect.innerHTML = '<option value="">目前沒有活動</option>';
    customFieldsContainer.innerHTML = "";
    return;
  }

  const previousOrderCampaign = orderCampaignSelect.value;
  const previousQueryCampaign = queryCampaignSelect.value;

  orderCampaignSelect.innerHTML = campaigns
    .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
    .join("");

  queryCampaignSelect.innerHTML = campaigns
    .map((c) => `<option value="${c.slug}">${escapeHtml(c.title)}</option>`)
    .join("");

  if (campaigns.some((c) => c.id === previousOrderCampaign)) {
    orderCampaignSelect.value = previousOrderCampaign;
  }

  if (campaigns.some((c) => c.slug === previousQueryCampaign)) {
    queryCampaignSelect.value = previousQueryCampaign;
  }

  renderCustomFields();
}

async function loadCampaigns() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, title, custom_fields")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  campaigns = data || [];
  renderCampaignOptions();
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

orderCampaignSelect.addEventListener("change", () => {
  renderCustomFields();
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(orderFormMessage, "送出中...");

  try {
    const supabase = getSupabase();
    const campaignId = orderCampaignSelect.value;
    const customerName = document.querySelector("#customer-name").value.trim();
    const phone = document.querySelector("#phone").value.trim();
    const email = document.querySelector("#email").value.trim();
    const quantity = Number(document.querySelector("#quantity").value);
    const transferAccount = document.querySelector("#transfer-account").value.trim();
    const transferTime = toLocalISO(document.querySelector("#transfer-time").value);
    const transactionMethod = document.querySelector("#transaction-method").value;
    const note = document.querySelector("#note").value.trim();
    const extraData = collectCustomFieldValues();

    if (!campaignId) throw new Error("目前沒有可訂購活動");
    if (!customerName) throw new Error("請輸入姓名");
    if (!phone) throw new Error("請輸入手機");
    if (!email) throw new Error("請輸入 Email");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("請輸入正確數量");
    if (!transferAccount) throw new Error("請輸入匯款帳號");
    if (!transferTime) throw new Error("請輸入正確的匯款時間");
    if (!["面交", "賣貨便"].includes(transactionMethod)) throw new Error("交易方式錯誤");

    const { error } = await supabase.from("orders").insert({
      campaign_id: campaignId,
      customer_name: customerName,
      phone,
      email,
      quantity,
      transfer_account: transferAccount,
      transfer_time: transferTime,
      transaction_method: transactionMethod,
      note,
      extra_data: extraData,
      status: STATUS_DEFAULT,
    });

    if (error) throw error;

    orderForm.reset();
    document.querySelector("#quantity").value = "1";
    document.querySelector("#transaction-method").value = "面交";
    renderCustomFields();
    setMessage(orderFormMessage, "送出成功，請保留姓名與手機末3碼以便查詢。", "success");
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
    const phoneLast3 = digitsOnly(document.querySelector("#query-phone-last3").value);

    if (!campaignSlug) throw new Error("請先選擇活動");
    if (!customerName) throw new Error("請輸入姓名");
    if (phoneLast3.length !== 3) throw new Error("手機末3碼格式錯誤");

    const { data, error } = await supabase.rpc("search_order_status", {
      p_campaign_slug: campaignSlug,
      p_customer_name: customerName,
      p_phone_last3: phoneLast3,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      setMessage(queryMessage, "查無資料，請確認姓名、手機末3碼與活動是否正確。");
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
    await loadCampaigns();
    document.querySelector("#transaction-method").value = "面交";
  } catch (error) {
    setMessage(orderFormMessage, `初始化失敗：${error.message}`, "error");
    setMessage(queryMessage, `初始化失敗：${error.message}`, "error");
  }
})();
