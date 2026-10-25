// くじ：確かめるリンク（?r=）を読む・引くのテスト（画面に触らない部分）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encode, decode, readLink, cleanInput } from "../js/link.js";
import { draw } from "../js/draw.js";
import { mergeState, problem } from "../js/store.js";
import { cardUrl } from "../js/link.js";

const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 外からの文字の見本
const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const data = { topics: json("topics.json"), penalties: json("penalties.json") };
const link = (obj) => encode(obj);

test("encode と decode で同じ中身に戻る（日本語も）", () => {
  const v = { m: "lottery", s: 123, i: { names: ["たろう", "はなこ"] } };
  assert.deepEqual(decode(encode(v)), v);
});

test("引いたときと同じタネ・入力なら、リンクを開いても同じ結果", () => {
  const input = { names: ["a", "b", "c", "d"], type: "win", wins: 1, teams: 2 };
  const result = draw("lottery", input, 42, data);
  const d = readLink(link({ m: "lottery", s: 42, i: input, t: 1 }), data);
  assert.deepEqual(d.result, result);
  const num = { min: 1, max: 75, count: 3, unique: true, exclude: [3, 5] };
  assert.deepEqual(readLink(link({ m: "number", s: 7, i: num }), data).result, draw("number", num, 7, data));
});

test("壊れた ?r= は投げる（画面は「読めませんでした」）", () => {
  for (const r of ["", "%%%", "!!!", "a".repeat(9000), "eyJt", encode("str"), encode({ m: "nope" }), encode([1, 2])]) {
    assert.throws(() => readLink(r, data), undefined, r.slice(0, 20));
  }
  assert.throws(() => readLink(null, data));
});

test("名前の HTML はそのまま文字として残る（画面で esc して出す）", () => {
  const d = readLink(link({ m: "lottery", s: 1, i: { names: [XSS, "b"], type: "order" } }), data);
  assert.ok(d.result.order.includes(XSS));
});

test("数字の欄に文字や大きすぎる数が入っても、決まった範囲の数だけになる", () => {
  const d = readLink(link({ m: "number", s: 1, i: { min: XSS, max: 1e15, count: 1e9, unique: "yes", exclude: [XSS, 1e20, 2] } }), data);
  assert.equal(d.input.min, 1);
  assert.equal(d.input.max, 99999);
  assert.equal(d.input.count, 20);
  assert.equal(d.input.unique, false);
  assert.deepEqual(d.input.exclude, [2]);
  assert.ok(d.result.nums.every(Number.isInteger));
});

test("終わらない引き方（重ならない数字が足りない）のリンクは読まない", () => {
  assert.throws(() => readLink(link({ m: "number", s: 1, i: { min: 1, max: 3, count: 10, unique: true } }), data));
  assert.throws(() => readLink(link({ m: "lottery", s: 1, i: { names: ["a"], type: "win" } }), data));
  assert.throws(() => readLink(link({ m: "amida", s: 1, i: { names: Array.from({ length: 40 }, (_, i) => "n" + i) } }), data));
});

test("名前の数・長さには上限がある", () => {
  const names = Array.from({ length: 500 }, (_, i) => "x".repeat(1000) + i);
  const input = cleanInput("lottery", { names, type: "order" });
  assert.equal(input.names.length, 40);
  assert.ok(input.names.every((n) => n.length <= 200));
  assert.deepEqual(cleanInput("roulette", { items: [{ a: 1 }, null, 3, "ok"] }).items, ["3", "ok"]);
});

test("お題の種類が知らないものなら読まない。時刻がおかしければ 0", () => {
  assert.throws(() => readLink(link({ m: "topic", s: 1, i: { cat: "zzz" } }), data));
  assert.equal(readLink(link({ m: "topic", s: 1, i: { cat: XSS }, t: "x" }), data).time, 0);
  const d = readLink(link({ m: "penalty", s: 9, i: { cat: "mild", names: ["a"] }, h: 1 }), data);
  assert.equal(d.secret, true);
  assert.equal(d.result.who, "a");
});

test("端末に残した設定が壊れていても、決まった形で開ける", () => {
  const s = mergeState({ mode: "nope", names: 5, lottery: "xx", number: { used: "abc", min: {}, keep: "yes" }, topic: null, amida: [1, 2] });
  assert.equal(s.mode, "lottery");
  assert.equal(typeof s.names, "string");
  assert.equal(s.lottery.type, "win");
  assert.ok(Array.isArray(s.number.used));
  assert.equal(s.number.keep, false);
  assert.equal(s.topic.cat, "all");
  assert.equal(s.amida.goals, "");
  const ok = mergeState({ names: "a\nb", number: { used: [3, 5, "x", 2.5], keep: true } });
  assert.deepEqual(ok.number.used, [3, 5]);
  assert.equal(ok.number.keep, true);
  assert.equal(ok.names, "a\nb");
});

test("ない種類のお題・罰ゲームは、引く前に理由を出す（引いて止まらない）", () => {
  assert.ok(problem("topic", { cat: "nope" }, data));
  assert.ok(problem("penalty", { cat: "nope", names: [] }, data));
  assert.equal(problem("topic", { cat: "all" }, data), "");
  assert.equal(problem("topic", { style: "letter" }, data), "");
  assert.throws(() => readLink(link({ m: "topic", s: 1, i: { cat: "nope" } }), data));
});

test("おくるんの部品が読めない（電波なし）ときも、カードの URL で止まらない", () => {
  globalThis.window = {};
  const d = { mode: "lottery", seed: 1, input: { names: ["a", "b"], type: "win", wins: 1, teams: 2 }, time: 1, secret: false };
  d.result = draw("lottery", d.input, 1, data);
  assert.equal(cardUrl(d), "#");
  delete globalThis.window;
});
