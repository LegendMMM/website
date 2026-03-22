import { useEffect, useMemo, useState } from "react";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "../lib/constants";
import { fixedTierLabel, formatDate, orderStatusLabel, twd } from "../lib/format";
import type { CharacterName, CharacterTier } from "../types/domain";
import { formatCharacterSlotSummary } from "./helpers";

type BulkCharacterTierValue = CharacterTier | "NONE";

export function AdminMembersPanel(props: {
  system: UseOrderSystemReturn;
  onFeedback: (message: string) => void;
}): JSX.Element {
  const { system, onFeedback } = props;
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterName>("八千代");
  const [memberOverviewKeyword, setMemberOverviewKeyword] = useState("");
  const [slotMemberKeyword, setSlotMemberKeyword] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [bulkCharacterTier, setBulkCharacterTier] = useState<BulkCharacterTierValue>("FIXED_1");
  const [pickupRateDrafts, setPickupRateDrafts] = useState<Record<string, string>>({});
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  const campaignById = useMemo(
    () => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])),
    [system.state.campaigns],
  );
  const productById = useMemo(
    () => new Map(system.state.products.map((product) => [product.id, product])),
    [system.state.products],
  );
  const blindItemById = useMemo(
    () => new Map(system.state.blindBoxItems.map((item) => [item.id, item])),
    [system.state.blindBoxItems],
  );
  const orderItemsByOrderId = useMemo(() => {
    const grouped = new Map<string, typeof system.state.orderItems>();
    system.state.orderItems.forEach((item) => {
      const existing = grouped.get(item.orderId);
      if (existing) {
        existing.push(item);
        return;
      }
      grouped.set(item.orderId, [item]);
    });
    return grouped;
  }, [system.state.orderItems]);

  const userOrderStatsById = useMemo(() => {
    const map = new Map<string, { orderCount: number; orderTotal: number }>();
    system.state.orders.forEach((order) => {
      const existing = map.get(order.userId) ?? { orderCount: 0, orderTotal: 0 };
      existing.orderCount += 1;
      existing.orderTotal += order.totalAmount;
      map.set(order.userId, existing);
    });
    return map;
  }, [system.state.orders]);

  const pendingClaimsByUserId = useMemo(() => {
    const map = new Map<string, number>();
    system.state.claims.forEach((claim) => {
      if (claim.status !== "LOCKED") return;
      map.set(claim.userId, (map.get(claim.userId) ?? 0) + 1);
    });
    return map;
  }, [system.state.claims]);

  const slotSummaryByUserId = useMemo(() => {
    const groupedSlots = new Map<string, typeof system.state.characterSlots>();
    system.state.characterSlots.forEach((slot) => {
      const existing = groupedSlots.get(slot.userId);
      if (existing) {
        existing.push(slot);
        return;
      }
      groupedSlots.set(slot.userId, [slot]);
    });
    return new Map(
      Array.from(groupedSlots.entries()).map(([userId, slots]) => [userId, formatCharacterSlotSummary(slots)]),
    );
  }, [system]);

  const memberRows = useMemo(() => (
    system.state.users
      .map((user) => {
        const orderStats = userOrderStatsById.get(user.id) ?? { orderCount: 0, orderTotal: 0 };
        return {
          user,
          orderCount: orderStats.orderCount,
          orderTotal: orderStats.orderTotal,
          pendingClaims: pendingClaimsByUserId.get(user.id) ?? 0,
          slotSummary: slotSummaryByUserId.get(user.id) ?? "未分配",
        };
      })
      .sort((a, b) => Number(b.user.isAdmin) - Number(a.user.isAdmin) || a.user.fbNickname.localeCompare(b.user.fbNickname))
  ), [pendingClaimsByUserId, slotSummaryByUserId, system, userOrderStatsById]);

  const filteredMemberRows = useMemo(() => {
    const keyword = memberOverviewKeyword.trim().toLowerCase();
    if (!keyword) return memberRows;
    return memberRows.filter(({ user }) => (
      user.fbNickname.toLowerCase().includes(keyword)
      || user.email.toLowerCase().includes(keyword)
    ));
  }, [memberOverviewKeyword, memberRows]);

  const slotAssignableRows = useMemo(() => {
    const keyword = slotMemberKeyword.trim().toLowerCase();
    return memberRows.filter(({ user }) => {
      if (user.isAdmin) return false;
      if (!keyword) return true;
      return user.fbNickname.toLowerCase().includes(keyword)
        || user.email.toLowerCase().includes(keyword);
    });
  }, [memberRows, slotMemberKeyword]);

  useEffect(() => {
    const availableIds = new Set(slotAssignableRows.map(({ user }) => user.id));
    setSelectedMemberIds((prev) => prev.filter((userId) => availableIds.has(userId)));
  }, [slotAssignableRows]);

  const toggleSelectedMember = (userId: string): void => {
    setSelectedMemberIds((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ));
  };

  const handleBatchCharacterSlotApply = (): void => {
    const result = system.adminAssignCharacterSlotsBatch({
      userIds: selectedMemberIds,
      character: selectedCharacter,
      tier: bulkCharacterTier === "NONE" ? null : bulkCharacterTier,
    });
    onFeedback(result.message);
    if (result.ok && bulkCharacterTier === "NONE") {
      setSelectedMemberIds([]);
    }
  };

  const handlePickupRateSave = (userId: string, currentPickupRate: number): void => {
    const draftValue = pickupRateDrafts[userId] ?? String(currentPickupRate);
    const nextValue = Number(draftValue);
    if (!Number.isFinite(nextValue)) {
      onFeedback("取貨率必須是數字。");
      return;
    }
    const result = system.adminUpdateUserPickupRate(userId, nextValue);
    onFeedback(result.message);
    if (result.ok) {
      setPickupRateDrafts((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  const memberStats = useMemo(() => ({
    total: system.state.users.filter((user) => !user.isAdmin).length,
    admins: system.state.users.filter((user) => user.isAdmin).length,
    pendingClaims: system.state.claims.filter((claim) => claim.status === "LOCKED").length,
  }), [system.state.claims, system.state.users]);

  return (
    <section className="space-y-4">
      <div className="admin-summary-grid">
        <article className="admin-summary-card"><span>會員</span><strong>{memberStats.total}</strong></article>
        <article className="admin-summary-card"><span>管理員</span><strong>{memberStats.admins}</strong></article>
        <article className="admin-summary-card"><span>待審喊單</span><strong>{memberStats.pendingClaims}</strong></article>
      </div>

      <div className="admin-panel-grid">
        <div className="section-frame">
          <div className="admin-section-head">
            <div>
              <h3 className="text-lg font-bold text-slate-900">帳號總覽</h3>
              <p className="admin-section-copy">先找人，再展開查看單人喊單與訂單紀錄。</p>
            </div>
          </div>
        <div className="mt-4">
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="搜尋會員暱稱或 Email"
            value={memberOverviewKeyword}
            onChange={(event) => setMemberOverviewKeyword(event.target.value)}
          />
        </div>
        <div className="mt-4 space-y-3">
          {filteredMemberRows.map(({ user, orderCount, orderTotal, pendingClaims, slotSummary }) => (
            <article key={user.id} className="row-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{user.fbNickname}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    身分：{user.isAdmin ? "管理員" : "會員"} / 角色固位：{slotSummary} / 取貨率：{user.pickupRate}%
                  </p>
                  <p className="text-xs text-slate-500">
                    訂單 {orderCount} 筆 / 累計 {twd(orderTotal)} / 待審喊單 {pendingClaims}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    onClick={() => setExpandedMemberId((current) => (current === user.id ? null : user.id))}
                  >
                    {expandedMemberId === user.id ? "收起紀錄" : "查看紀錄"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    onClick={async () => {
                      const result = await system.adminSetUserAdmin(user.id, !user.isAdmin);
                      onFeedback(result.message);
                    }}
                    disabled={user.id === system.currentUser?.id}
                  >
                    {user.isAdmin ? "取消管理員" : "設為管理員"}
                  </button>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
                    <input
                      className="w-20 border-0 bg-transparent px-1 py-1 text-xs focus:outline-none"
                      type="number"
                      min={0}
                      max={100}
                      value={pickupRateDrafts[user.id] ?? String(user.pickupRate)}
                      onChange={(event) => setPickupRateDrafts((prev) => ({
                        ...prev,
                        [user.id]: event.target.value,
                      }))}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                      onClick={() => handlePickupRateSave(user.id, user.pickupRate)}
                    >
                      存取貨率
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                    disabled={user.id === system.currentUser?.id}
                    onClick={async () => {
                      const ok = window.confirm(
                        `確定要刪除 ${user.fbNickname}？\n這會移除該帳號與其相關的購物車/喊單/訂單/物流資料。`,
                      );
                      if (!ok) return;
                      const result = await system.adminDeleteUser(user.id);
                      onFeedback(result.message);
                    }}
                  >
                    刪除帳號
                  </button>
                </div>
              </div>

              {expandedMemberId === user.id && (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <section className="mini-preview-card space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">喊單紀錄</h4>
                      <p className="text-xs text-slate-500">可直接在這裡確認或取消單筆喊單。</p>
                    </div>

                    {system.state.claims
                      .filter((claim) => claim.userId === user.id)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((claim) => {
                        const campaign = campaignById.get(claim.campaignId);
                        const product = productById.get(claim.productId);
                        const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
                        const label = blindItem
                          ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                          : product?.name ?? "未知商品";

                        return (
                          <article key={claim.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                            <p className="text-sm font-semibold text-slate-900">{label}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {campaign?.title ?? "未知活動"} / {formatDate(claim.createdAt)}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">狀態：{claim.status}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                                onClick={() => {
                                  const result = system.adminConfirmClaim(claim.id);
                                  onFeedback(result.message);
                                }}
                                disabled={claim.status !== "LOCKED"}
                              >
                                確認分配
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                                onClick={() => {
                                  const result = system.adminCancelClaim(claim.id);
                                  onFeedback(result.message);
                                }}
                                disabled={claim.status === "CANCELLED_BY_ADMIN"}
                              >
                                取消喊單
                              </button>
                            </div>
                          </article>
                        );
                      })}

                    {system.state.claims.every((claim) => claim.userId !== user.id) && (
                      <p className="text-sm text-slate-500">這位會員目前沒有喊單紀錄。</p>
                    )}
                  </section>

                  <section className="mini-preview-card space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">訂單紀錄</h4>
                      <p className="text-xs text-slate-500">方便一起對照這位會員已下單的內容。</p>
                    </div>

                    {system.state.orders
                      .filter((order) => order.userId === user.id)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((order) => {
                        const campaign = campaignById.get(order.campaignId);
                        const orderItems = orderItemsByOrderId.get(order.id) ?? [];

                        return (
                          <article key={order.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                              <span className="text-xs font-semibold text-slate-600">{orderStatusLabel[order.status]}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-700">總額：{twd(order.totalAmount)}</p>
                            <div className="mt-2 space-y-1 text-xs text-slate-600">
                              {orderItems.map((item) => {
                                const product = productById.get(item.productId);
                                const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) : null;
                                const label = blindItem
                                  ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                                  : product?.name ?? "未知商品";
                                return <p key={item.id}>- {label} x {item.qty}</p>;
                              })}
                            </div>
                          </article>
                        );
                      })}

                    {system.state.orders.every((order) => order.userId !== user.id) && (
                      <p className="text-sm text-slate-500">這位會員目前沒有訂單紀錄。</p>
                    )}
                  </section>
                </div>
              )}
            </article>
          ))}
        </div>
        </div>

        <div className="section-frame">
          <div className="admin-section-head">
            <div>
              <h3 className="text-lg font-bold text-slate-900">角色固位分配</h3>
              <p className="admin-section-copy">右邊專門處理固位，和會員總覽分開，操作會比較乾淨。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cta-secondary"
                onClick={() => {
                  const result = system.adminAutoAssignCharacterSlots(selectedCharacter);
                  onFeedback(result.message);
                }}
              >
                自動分配 {selectedCharacter}
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                onClick={() => setSelectedMemberIds(slotAssignableRows.map(({ user }) => user.id))}
                disabled={slotAssignableRows.length === 0}
              >
                全選篩選結果
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                onClick={() => setSelectedMemberIds([])}
                disabled={selectedMemberIds.length === 0}
              >
                清空選取
              </button>
            </div>
          </div>

          <div className="admin-chip-group mt-4">
            {CHARACTER_OPTIONS.map((character) => (
              <button
                key={character}
                type="button"
                className={selectedCharacter === character ? "admin-chip admin-chip-active" : "admin-chip"}
                onClick={() => setSelectedCharacter(character)}
              >
                {character}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="搜尋要分配固位的會員"
              value={slotMemberKeyword}
              onChange={(event) => setSlotMemberKeyword(event.target.value)}
            />
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={bulkCharacterTier}
              onChange={(event) => setBulkCharacterTier(event.target.value as BulkCharacterTierValue)}
            >
              {["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"].map((optionTier) => (
                <option key={optionTier} value={optionTier}>{fixedTierLabel(optionTier as CharacterTier)}</option>
              ))}
              <option value="NONE">無</option>
            </select>
            <button
              type="button"
              className="cta-primary"
              onClick={handleBatchCharacterSlotApply}
              disabled={selectedMemberIds.length === 0}
            >
              套用到 {selectedMemberIds.length} 位會員
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {slotAssignableRows.map(({ user }) => {
              const tier = system.getUserCharacterTier(user.id, selectedCharacter);
              const isSelected = selectedMemberIds.includes(user.id);
              return (
                <div key={`${user.id}:${selectedCharacter}`} className="mini-preview-card flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <label className="mt-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectedMember(user.id)}
                      />
                    </label>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{user.fbNickname}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      <p className="text-xs text-slate-500">{selectedCharacter} 目前：{tier ? fixedTierLabel(tier) : "無（預設）"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"] as CharacterTier[]).map((optionTier) => (
                      <button
                        key={optionTier}
                        type="button"
                        className={`rounded border px-2 py-1 text-xs ${
                          tier === optionTier ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                        }`}
                        onClick={() => {
                          const result = system.adminAssignCharacterSlot({
                            userId: user.id,
                            character: selectedCharacter,
                            tier: optionTier,
                          });
                          onFeedback(result.message);
                        }}
                      >
                        {fixedTierLabel(optionTier)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`rounded border px-2 py-1 text-xs ${
                        tier === null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                      }`}
                      onClick={() => {
                        const result = system.adminAssignCharacterSlot({
                          userId: user.id,
                          character: selectedCharacter,
                          tier: null,
                        });
                        onFeedback(result.message);
                      }}
                    >
                      無
                    </button>
                  </div>
                </div>
              );
            })}
            {slotAssignableRows.length === 0 && (
              <div className="mini-preview-card text-sm text-slate-500">找不到符合條件的會員。</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
