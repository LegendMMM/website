import { getSupabase } from "./supabaseClient.js";

const STATUS_OPTIONS = ["已匯款", "已採購", "已到貨", "已完成"];

const authPanel = document.querySelector("#auth-panel");
const adminPanel = document.querySelector("#admin-panel");
const authMessage = document.querySelector("#auth-message");
const campaignMessage = document.querySelector("#campaign-message");
const ordersMessage = document.querySelector("#orders-message");

const loginForm = document.querySelector("#login-form");
const campaignForm = document.querySelector("#campaign-form");
const adminCampaignFilter = document.querySelector("#admin-campaign-filter");
const ordersBody = document.querySelector("#orders-body");
const reloadOrdersBtn = document.querySelector("#reload-orders-btn");
const exportCsvBtn = document.querySelector("#export-csv-btn");
const logoutBtn = document.querySelector("#logout-btn");

let activeCampaigns = [];
let currentOrders = [];

function setMessage(el, text, type = "") {
  el.textContent = text;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

function toCsvText(rows) {
  const headers = [
    "活動",
    "姓名",
    "手機",
    "Email",
    "數量",
    "匯款帳號",
    "匯款時間",
    "備註",
    "狀態",
    "建立時間",
  ];

  const escapeCell = (value) => {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
  };

  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.campaign_title,
        row.customer_name,
        row.phone,
        row.email,
        row.quantity,
        row.transfer_account,
        row.transfer_time,
        row.note,
        row.status,
        row.created_at,
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

function setSignedInState(isSignedIn) {
  authPanel.classList.toggle("hidden", isSignedIn);
  adminPanel.classList.toggle("hidden", !isSignedIn);
}

async function requireSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function loadCampaignsForAdmin() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, title, is_active")
    .order("created_at", { ascending: false });

  if (error) throw error;

  activeCampaigns = data || [];
  if (!activeCampaigns.length) {
    adminCampaignFilter.innerHTML = '<option value="">目前沒有活動</option>';
    return;
  }

  adminCampaignFilter.innerHTML = activeCampaigns
    .map((c) => `<option value="${c.id}">${c.title}${c.is_active ? "" : " (停用)"}</option>`)
    .join("");
}

function rowStatusSelect(orderId, currentStatus) {
  return `<select class="status-select" data-order-id="${orderId}">${STATUS_OPTIONS.map(
    (status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${status}</option>`,
  ).join("")}</select>`;
}

function renderOrders(rows) {
  if (!rows.length) {
    ordersBody.innerHTML = "";
    return;
  }

  ordersBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.customer_name}</td>
        <td>${row.phone}</td>
        <td>${row.email}</td>
        <td>${row.quantity}</td>
        <td>${row.transfer_account}</td>
        <td>${formatDate(row.transfer_time)}</td>
        <td>${row.note || ""}</td>
        <td>${rowStatusSelect(row.id, row.status)}</td>
        <td><button type="button" data-action="update" data-order-id="${row.id}">儲存</button></td>
      </tr>
    `,
    )
    .join("");
}

async function loadOrders() {
  const campaignId = adminCampaignFilter.value;
  if (!campaignId) {
    currentOrders = [];
    ordersBody.innerHTML = "";
    return;
  }

  const supabase = getSupabase();
  const selectedCampaign = activeCampaigns.find((c) => c.id === campaignId);

  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_name, phone, email, quantity, transfer_account, transfer_time, note, status, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  currentOrders = (data || []).map((item) => ({
    ...item,
    campaign_title: selectedCampaign?.title || "",
  }));

  renderOrders(currentOrders);
}

async function updateOrderStatus(orderId, status) {
  const supabase = getSupabase();
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(authMessage, "寄送中...");

  try {
    const supabase = getSupabase();
    const email = document.querySelector("#admin-email").value.trim();
    const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) throw error;
    setMessage(authMessage, "登入連結已寄出，請到 Email 點擊連結。", "success");
  } catch (error) {
    setMessage(authMessage, `寄送失敗：${error.message}`, "error");
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

    if (!slug || !title) throw new Error("請輸入活動代碼與標題");

    const { error } = await supabase.from("campaigns").insert({
      slug,
      title,
      description,
      is_active: true,
    });

    if (error) throw error;

    campaignForm.reset();
    setMessage(campaignMessage, "活動建立完成。", "success");
    await loadCampaignsForAdmin();
    await loadOrders();
  } catch (error) {
    setMessage(campaignMessage, `建立失敗：${error.message}`, "error");
  }
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
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setMessage(ordersMessage, `載入失敗：${error.message}`, "error");
  }
});

ordersBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action !== "update") return;

  const orderId = target.dataset.orderId;
  if (!orderId) return;

  const select = ordersBody.querySelector(`select[data-order-id="${orderId}"]`);
  if (!(select instanceof HTMLSelectElement)) return;

  setMessage(ordersMessage, "更新中...");
  try {
    await updateOrderStatus(orderId, select.value);
    setMessage(ordersMessage, "狀態已更新。", "success");
    await loadOrders();
  } catch (error) {
    setMessage(ordersMessage, `更新失敗：${error.message}`, "error");
  }
});

exportCsvBtn.addEventListener("click", async () => {
  try {
    if (!currentOrders.length) {
      setMessage(ordersMessage, "目前無資料可匯出");
      return;
    }

    const campaign = activeCampaigns.find((c) => c.id === adminCampaignFilter.value);
    const safeSlug = campaign?.slug || "orders";
    const csv = toCsvText(currentOrders);
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

    setSignedInState(true);
    await loadCampaignsForAdmin();
    await loadOrders();
    setMessage(ordersMessage, `已載入 ${currentOrders.length} 筆。`, "success");
  } catch (error) {
    setSignedInState(false);
    setMessage(authMessage, `管理頁初始化失敗：${error.message}`, "error");
  }
})();
