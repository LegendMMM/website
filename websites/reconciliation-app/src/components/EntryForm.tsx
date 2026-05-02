"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createLedgerEntryAction } from "@/app/actions";
import type { Dictionary } from "@/lib/i18n";

type EntryFormProps = {
  dictionary: Dictionary;
};

type DraftLine = {
  id: string;
  label: string;
  amount: string;
  currency: "JPY" | "TWD";
};

function newLine(): DraftLine {
  return {
    id: crypto.randomUUID(),
    label: "",
    amount: "",
    currency: "JPY",
  };
}

export function EntryForm({ dictionary }: EntryFormProps) {
  const [lines, setLines] = useState<DraftLine[]>([
    { id: "initial-line", label: "商品金額", amount: "", currency: "JPY" },
  ]);
  const lineItemsJson = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => ({
          label: line.label,
          amount: Number(line.amount),
          currency: line.currency,
        })),
      ),
    [lines],
  );

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
  }

  return (
    <form action={createLedgerEntryAction} className="panel form-grid wide-form">
      <input type="hidden" name="lineItemsJson" value={lineItemsJson} />
      <label>
        <span>{dictionary.title}</span>
        <input name="title" required placeholder="例：4 月第二批寄貨" />
      </label>
      <label>
        <span>{dictionary.date}</span>
        <input name="entryDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </label>
      <label>
        <span>{dictionary.type}</span>
        <select name="type" defaultValue="SHIPMENT">
          <option value="SHIPMENT">{dictionary.shipment}</option>
          <option value="TRANSFER">{dictionary.transfer}</option>
          <option value="ADJUSTMENT">{dictionary.adjustment}</option>
        </select>
      </label>
      <label>
        <span>{dictionary.direction}</span>
        <select name="direction" defaultValue="PARTNER_TO_ADMIN">
          <option value="PARTNER_TO_ADMIN">{dictionary.partnerToAdmin}</option>
          <option value="ADMIN_TO_PARTNER">{dictionary.adminToPartner}</option>
        </select>
      </label>
      <label>
        <span>{dictionary.feePolicy}</span>
        <select name="wiseFeePolicy" defaultValue="SENDER">
          <option value="SENDER">{dictionary.senderPays}</option>
          <option value="RECEIVER">{dictionary.receiverPays}</option>
          <option value="SPLIT">{dictionary.splitFee}</option>
        </select>
      </label>
      <label>
        <span>{dictionary.tracking}</span>
        <input name="trackingCode" placeholder="EMS / Yamato / 7-11" />
      </label>
      <label>
        <span>{dictionary.reference}</span>
        <input name="externalRef" placeholder="Wise ID / URL" />
      </label>
      <label className="span-2">
        <span>{dictionary.memo}</span>
        <textarea name="note" rows={3} placeholder="包裹內容、補充說明、對方確認事項" />
      </label>

      <section className="line-editor span-2">
        <div className="section-title">
          <div>
            <p className="eyebrow">{dictionary.lineItems}</p>
            <h2>{dictionary.amount}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={() => setLines((current) => [...current, newLine()])}>
            <Plus size={16} />
            {dictionary.addLine}
          </button>
        </div>
        <div className="line-table">
          {lines.map((line) => (
            <div className="line-row" key={line.id}>
              <input
                aria-label="label"
                placeholder="項目名稱"
                required
                value={line.label}
                onChange={(event) => updateLine(line.id, { label: event.target.value })}
              />
              <input
                aria-label="amount"
                inputMode="decimal"
                min="0"
                placeholder="0"
                required
                type="number"
                value={line.amount}
                onChange={(event) => updateLine(line.id, { amount: event.target.value })}
              />
              <select
                aria-label="currency"
                value={line.currency}
                onChange={(event) => updateLine(line.id, { currency: event.target.value as "JPY" | "TWD" })}
              >
                <option value="JPY">JPY</option>
                <option value="TWD">TWD</option>
              </select>
              <button className="icon-button" type="button" title="remove" onClick={() => removeLine(line.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="form-actions span-2">
        <button className="primary-button" type="submit">
          {dictionary.save}
        </button>
      </div>
    </form>
  );
}
