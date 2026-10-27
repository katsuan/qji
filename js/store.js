// 入力の状態（名前・各モードの設定）。この端末（localStorage の qji:state）に残す
// 読まれるところ：app.js・js/link.js・js/form.js（import）
import { isMode } from "./modes.js?v=202610271257";

const STORAGE_KEY = "qji:state";

const DEFAULTS = {
  mode: "lottery",
  names: "",
  lottery: { type: "win", wins: 1, teams: 2 },
  amida: { goals: "" },
  roulette: { own: false, items: "" },
  number: { min: 1, max: 100, count: 1, unique: true, keep: false, used: [] }, // keep：前に出た数字も出さない（ビンゴのように）。used に出た数字をためる
  topic: { cat: "all", style: "question" }, // style：question（ふつうのお題）か letter（「あ」から始まる「〇〇」は？）
  penalty: { cat: "all", who: true }
};

export const MAX_USED = 2000; // 出た数字をためておく数の上限

// ふつうのオブジェクト（配列でない）か
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// 残した値が初期値と同じ種類のときだけ使う（数の欄は、入力のまま文字で残ることもある）
function sameType(def, val) {
  if (Array.isArray(def)) return Array.isArray(val) ? val.filter(Number.isInteger).slice(-MAX_USED) : def;
  if (typeof def === "number") return (typeof val === "number" && Number.isFinite(val)) || typeof val === "string" ? val : def;
  return typeof val === typeof def ? val : def;
}

// 端末に残した中身を、決まった形にそろえる（壊れていても開けるように）
export function mergeState(saved) {
  const merged = structuredClone(DEFAULTS);
  if (!isObj(saved)) return merged;
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const val = saved[key];
    if (val == null) continue;
    if (!isObj(def)) merged[key] = sameType(def, val);
    else if (isObj(val)) for (const k of Object.keys(def)) if (val[k] != null) merged[key][k] = sameType(def[k], val[k]);
  }
  if (!isMode(merged.mode)) merged.mode = DEFAULTS.mode;
  return merged;
}

// 端末に残した状態を読む（壊れていれば初期値）
function loadState() {
  try {
    return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return mergeState({});
  }
}

export const state = loadState();

// いまの状態を端末に残す
export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できない環境でも、開いているあいだは使える
  }
}

// "lottery.wins" のような書き方で、モードごとの値も読み書きする
export function setValue(bind, value) {
  const [a, b] = bind.split(".");
  if (b) state[a][b] = value;
  else state[a] = value;
  saveState();
}

// "lottery.wins" のような書き方で値を読む
export function getValue(bind) {
  const [a, b] = bind.split(".");
  return b ? state[a][b] : state[a];
}

// 1行に1つ（「、」「,」でも区切れる）。40個まで
export const lines = (text) =>
  String(text || "")
    .split(/\r?\n|、|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);

// 整数にして min〜max に入れる（数でなければ fallback）
export const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// 引くのに使う入力（モードごとに、要るものだけ）。確かめるリンクにもこのまま入る
export function currentInput(mode) {
  const names = lines(state.names);
  switch (mode) {
    case "lottery":
      return { names, type: state.lottery.type, wins: clampInt(state.lottery.wins, 1, 39, 1), teams: clampInt(state.lottery.teams, 2, 10, 2) };
    case "amida":
      return { names, goals: lines(state.amida.goals) };
    case "roulette":
      return { items: state.roulette.own ? lines(state.roulette.items) : names };
    case "number": {
      const min = clampInt(state.number.min, -99999, 99999, 1);
      const max = clampInt(state.number.max, -99999, 99999, 100);
      const lo = Math.min(min, max), hi = Math.max(min, max);
      // ビンゴのように続けて引くときは、前に出た数字（範囲内のもの）を外す。確かめるリンクにも入れて同じ結果にする
      const exclude = state.number.keep ? (state.number.used || []).filter((n) => n >= lo && n <= hi).sort((a, b) => a - b) : [];
      return { min: lo, max: hi, count: clampInt(state.number.count, 1, 20, 1), unique: Boolean(state.number.unique) || state.number.keep, ...(exclude.length ? { exclude } : {}) };
    }
    case "topic":
      return state.topic.style === "letter" ? { style: "letter" } : { cat: state.topic.cat };
    case "penalty":
      return { cat: state.penalty.cat, names: state.penalty.who ? names : [] };
    default:
      return {};
  }
}

// 引けるかどうか（引けないときは理由）。data はお題・罰ゲームのデータ
export function problem(mode, input, data) {
  if (mode === "lottery") {
    if (input.names.length < 2) return "名前を2人以上入れてね。";
    if (input.type === "win" && input.wins >= input.names.length) return "当たりの数は、人数より少なくしてね。";
    if (input.type === "team" && input.teams > input.names.length) return "チームの数は、人数までにしてね。";
  }
  if (mode === "amida") {
    if (input.names.length < 2) return "名前を2人以上入れてね。";
    if (input.names.length > 12) return "あみだは12人までです。";
  }
  if (mode === "roulette" && input.items.length < 2) return state.roulette.own ? "ルーレットの項目を2つ以上入れてね。" : "名前を2つ以上入れてね。";
  if (mode === "number") {
    const left = input.max - input.min + 1 - (input.exclude || []).length;
    if (input.exclude && left <= 0) return "範囲の数字はぜんぶ出ました。「出た数字をリセット」で、はじめから引けます。";
    if (input.unique && input.count > left) return input.exclude ? `残りの数字は ${left} 個です。いくつ出すかを減らしてね。` : "重ならない数字が足りません。範囲を広げるか、数を減らしてね。";
  }
  if ((mode === "topic" && !data.topics) || (mode === "penalty" && !data.penalties)) return "お題を読みこみ中です。少し待ってから、もう一度押してね。";
  // 前に選んだ種類が、いまのお題・罰ゲームにないとき
  if (mode === "topic" && input.style !== "letter" && !hasCategory(data.topics, input.cat)) return "お題の種類を選び直してね。";
  if (mode === "penalty" && !hasCategory(data.penalties, input.cat)) return "罰ゲームの種類を選び直してね。";
  return "";
}

// その種類のお題・罰ゲームがあるか（"all" はいつもある）
const hasCategory = (json, cat) => cat === "all" || ((json && json.categories) || []).some((c) => c.key === cat);
