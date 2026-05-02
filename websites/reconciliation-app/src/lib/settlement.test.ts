import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateSettlementSummary,
  calculateWiseFee,
  filterUnsettledConfirmedItems,
  recommendedSettlement,
  signedJpyForLineItem,
  toJpy,
  type SettlementConfig,
  type SettlementLineItem,
} from "./settlement";

const baseConfig: SettlementConfig = {
  jpyPerTwd: 5,
  wiseFee: {
    fixedJpy: 100,
    percent: 0.02,
  },
  feePolicy: "SPLIT",
};

describe("settlement calculations", () => {
  it("uses JPY as the default currency and converts TWD with a fixed rate", () => {
    assert.equal(toJpy(250, undefined, 5), 250);
    assert.equal(toJpy(100, "JPY", 5), 100);
    assert.equal(toJpy(10, "TWD", 5), 50);
    assert.equal(toJpy(10.4, "TWD", 4.7), 49);
  });

  it("signs direction from the admin point of view", () => {
    assert.equal(
      signedJpyForLineItem(
        { id: "admin-owes", amount: 1200, direction: "ADMIN_TO_PARTNER" },
        baseConfig.jpyPerTwd,
      ),
      -1200,
    );
    assert.equal(
      signedJpyForLineItem(
        { id: "partner-owes", amount: 200, currency: "TWD", direction: "PARTNER_TO_ADMIN" },
        baseConfig.jpyPerTwd,
      ),
      1000,
    );
  });

  it("filters to confirmed and unsettled line items", () => {
    const items: SettlementLineItem[] = [
      { id: "included", amount: 100, direction: "PARTNER_TO_ADMIN", confirmed: true },
      { id: "unconfirmed", amount: 100, direction: "PARTNER_TO_ADMIN", confirmed: false },
      { id: "missing-confirmed", amount: 100, direction: "PARTNER_TO_ADMIN" },
      { id: "settled", amount: 100, direction: "PARTNER_TO_ADMIN", confirmed: true, settled: true },
    ];

    assert.deepEqual(
      filterUnsettledConfirmedItems(items).map((item) => item.id),
      ["included"],
    );
  });

  it("summarizes net JPY, per-currency totals, recommended payer, and fees", () => {
    const summary = calculateSettlementSummary(
      [
        { id: "a", amount: 1000, direction: "PARTNER_TO_ADMIN", confirmed: true },
        { id: "b", amount: 200, currency: "TWD", direction: "ADMIN_TO_PARTNER", confirmed: true },
        { id: "c", amount: 500, currency: "JPY", direction: "PARTNER_TO_ADMIN", confirmed: true, settled: true },
        { id: "d", amount: 999, currency: "TWD", direction: "PARTNER_TO_ADMIN", confirmed: false },
      ],
      baseConfig,
    );

    assert.equal(summary.items.length, 2);
    assert.equal(summary.netJpy, 0);
    assert.deepEqual(summary.totalsByCurrency, { JPY: 1000, TWD: 200 });
    assert.deepEqual(summary.recommended, { payer: null, payee: null, amountJpy: 0 });
    assert.deepEqual(summary.wiseFee, { totalJpy: 100, senderJpy: 50, receiverJpy: 50 });
  });

  it("recommends the partner pays admin when signed net is positive", () => {
    assert.deepEqual(recommendedSettlement(1250), {
      payer: "PARTNER",
      payee: "ADMIN",
      amountJpy: 1250,
    });
  });

  it("recommends the admin pays partner when signed net is negative", () => {
    assert.deepEqual(recommendedSettlement(-750), {
      payer: "ADMIN",
      payee: "PARTNER",
      amountJpy: 750,
    });
  });

  it("allocates Wise fees by policy", () => {
    const fee = { fixedJpy: 100, percent: 0.015 };

    assert.deepEqual(calculateWiseFee(1000, fee, "SENDER"), {
      totalJpy: 115,
      senderJpy: 115,
      receiverJpy: 0,
    });
    assert.deepEqual(calculateWiseFee(1000, fee, "RECEIVER"), {
      totalJpy: 115,
      senderJpy: 0,
      receiverJpy: 115,
    });
    assert.deepEqual(calculateWiseFee(1000, fee, "SPLIT"), {
      totalJpy: 115,
      senderJpy: 57,
      receiverJpy: 58,
    });
  });
});
