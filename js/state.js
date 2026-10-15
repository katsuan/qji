// 入力の状態（名前・各モードの設定）。この端末（localStorage の qji:state）に残す
import { isMode } from "./modes.js";

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

function mergeState(saved) {
  const merged = structuredClone(DEFAULTS);
  for (const key of Object.keys(DEFAULTS)) {
    if (saved[key] == null) continue;
    merged[key] = typeof DEFAULTS[key] === "object" ? { ...DEFAULTS[key], ...saved[key] } : saved[key];
  }
  if (!isMode(merged.mode)) merged.mode = DEFAULTS.mode;
  return merged;
}

function loadState() {
  try {
    return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return mergeState({});
  }
}

export const state = loadState();

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
    if (input.names.length < 2) return "名前を2人以上入れてください。";
    if (input.type === "win" && input.wins >= input.names.length) return "当たりの数は、人数より少なくしてください。";
    if (input.type === "team" && input.teams > input.names.length) return "チームの数は、人数以下にしてください。";
  }
  if (mode === "amida") {
    if (input.names.length < 2) return "名前を2人以上入れてください。";
    if (input.names.length > 12) return "あみだは12人までです。";
  }
  if (mode === "roulette" && input.items.length < 2) return state.roulette.own ? "ルーレットの項目を2つ以上入れてください。" : "名前を2つ以上入れてください。";
  if (mode === "number") {
    const left = input.max - input.min + 1 - (input.exclude || []).length;
    if (input.exclude && left <= 0) return "範囲の数字はぜんぶ出ました。「出た数字をリセット」で、はじめから引けます。";
    if (input.unique && input.count > left) return input.exclude ? `残りの数字は ${left} 個です。いくつ出すかを減らしてください。` : "重ならない数字が足りません。範囲を広げるか、数を減らしてください。";
  }
  if ((mode === "topic" && !data.topics) || (mode === "penalty" && !data.penalties)) return "お題を読み込み中です。少し待ってからもう一度。";
  return "";
}
