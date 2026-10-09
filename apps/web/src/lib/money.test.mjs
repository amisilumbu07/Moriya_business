import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, moneyProblem, parseMoney, toInputMoney } from "./money.ts";

test("formatMoney shows kwacha with two decimals", () => {
  assert.equal(formatMoney(0), "K0.00");
  assert.equal(formatMoney(5), "K0.05");
  assert.equal(formatMoney(1250), "K12.50");
  assert.equal(formatMoney(150000), "K1,500.00");
  assert.equal(formatMoney(123456789), "K1,234,567.89");
  assert.equal(formatMoney(-1005), "−K10.05");
});

test("parseMoney converts to whole ngwee without float errors", () => {
  assert.equal(parseMoney("12"), 1200);
  assert.equal(parseMoney("12.5"), 1250);
  assert.equal(parseMoney("12.50"), 1250);
  assert.equal(parseMoney("0.05"), 5);
  assert.equal(parseMoney(" 0.1 "), 10);
  assert.equal(parseMoney("19.99"), 1999);
  assert.equal(parseMoney("1.15"), 115); // 1.15 * 100 === 114.99999999999999 in floating point
  assert.equal(parseMoney("4.35"), 435);
});

test("parseMoney rejects anything ambiguous", () => {
  for (const bad of ["", "abc", "12.345", "1,500", "12,50", "-5", "1e3", "12.", ".5", "1 000", "K12"]) {
    assert.equal(parseMoney(bad), null, bad);
  }
});

test("moneyProblem gives a helpful message", () => {
  assert.equal(moneyProblem("12.50"), null);
  assert.match(moneyProblem("12,50"), /dot/);
  assert.match(moneyProblem("12.345"), /2 decimals/);
  assert.match(moneyProblem(""), /Enter/);
});

test("toInputMoney round-trips with parseMoney", () => {
  for (const n of [0, 5, 100, 1250, 1999, 150000, 123456]) assert.equal(parseMoney(toInputMoney(n)), n);
  assert.equal(toInputMoney(1500), "15");
  assert.equal(toInputMoney(1250), "12.50");
});
