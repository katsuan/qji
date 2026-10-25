// 確かめるリンク（?r=<base64url(JSON)>）と、おくるんで送るカードの URL
// d（引いた結果）は { mode, seed, input, time, result, secret }
// 読まれるところ：app.js・js/result.js（import）
import { draw, summary } from "./draw.js?v=202610250232";
import { findMode, isMode } from "./modes.js?v=202610250232";
import { clampInt, problem } from "./store.js?v=202610250232";

const PAGE_URL = "https://katsuan.github.io/qji/";
const CARD_COLOR = "#E23E4A"; // ロゴのコーラルの赤

// 中身（オブジェクト）を JSON → UTF-8 → base64url の文字にする
export function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// encode の逆。base64url の文字から中身に戻す（読めないときは投げる）
export function decode(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

// ---- 確かめるリンクを読む（外から来た中身なので、引くときと同じ形・範囲にそろえてから使う） ----
const MAX_LINK = 8000; // ?r= の長さの上限（名前 40 人でも 3000 字ほど）
const MAX_TEXT = 200; // 名前・項目 1つの長さ
const MAX_ITEMS = 40; // 名前・項目の数（入力の lines() と同じ）
const KEY_RE = /^[a-z0-9_-]{1,20}$/i;

// 名前・項目の配列を、文字だけ・長さと数の上限つきにそろえる
const texts = (v) =>
  (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === "string" || typeof s === "number")
    .map((s) => String(s).slice(0, MAX_TEXT))
    .filter((s) => s.trim())
    .slice(0, MAX_ITEMS);
// list の中の値ならそのまま、ちがえば fallback
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
// お題・罰ゲームの種類の名前（形がちがえば "all"）
const key = (v) => (typeof v === "string" && KEY_RE.test(v) ? v : "all");

// リンクで受けとった入力を、引くときと同じ形・範囲にそろえる
export function cleanInput(mode, i) {
  const v = i && typeof i === "object" && !Array.isArray(i) ? i : {};
  switch (mode) {
    case "lottery":
      return { names: texts(v.names), type: oneOf(v.type, ["win", "order", "team"], "win"), wins: clampInt(v.wins, 1, 39, 1), teams: clampInt(v.teams, 2, 10, 2) };
    case "amida":
      return { names: texts(v.names), goals: texts(v.goals) };
    case "roulette":
      return { items: texts(v.items) };
    case "number": {
      const min = clampInt(v.min, -99999, 99999, 1);
      const max = clampInt(v.max, -99999, 99999, 100);
      const lo = Math.min(min, max), hi = Math.max(min, max);
      const exclude = [...new Set((Array.isArray(v.exclude) ? v.exclude : []).filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((a, b) => a - b);
      return { min: lo, max: hi, count: clampInt(v.count, 1, 20, 1), unique: v.unique === true, ...(exclude.length ? { exclude } : {}) };
    }
    case "topic":
      return v.style === "letter" ? { style: "letter" } : { cat: key(v.cat) };
    case "penalty":
      return { cat: key(v.cat), names: texts(v.names) };
    default:
      return {};
  }
}

// ?r= の文字から、引いた結果 { mode, seed, input, time, result, secret } を作る。読めないときは投げる
export function readLink(r, data) {
  if (typeof r !== "string" || !r || r.length > MAX_LINK || !/^[A-Za-z0-9_-]+$/.test(r)) throw new Error("link");
  const v = decode(r);
  if (!v || typeof v !== "object" || !isMode(v.m)) throw new Error("mode");
  const input = cleanInput(v.m, v.i);
  // 引けない条件（人数が足りない・数字が足りないなど）のリンクは読まない
  if (problem(v.m, input, data)) throw new Error("input");
  const seed = Number(v.s) >>> 0;
  const result = draw(v.m, input, seed, data);
  if (!result || (result.kind === "topic" || result.kind === "penalty" ? !result.pick : false)) throw new Error("draw");
  const time = Number.isFinite(v.t) && v.t > 0 && v.t < 1e14 ? v.t : 0;
  return { mode: v.m, seed, input, time, result, secret: v.h === 1 };
}

// h: 1 はヒミツで引いたもの（開いた人が「ひらく」を押すまで結果を見せない）
export function verifyUrl(d) {
  return `${PAGE_URL}?r=${encode({ m: d.mode, s: d.seed, i: d.input, t: d.time, ...(d.secret ? { h: 1 } : {}) })}`;
}

// カードのバッジ：引いたモード（と、ヒミツ・続けて引いたときはその印）
function badges(d, mode) {
  const list = [`${mode.icon} ${mode.label}`];
  if (d.secret) list.push("🔒 ヒミツ");
  if (d.input.exclude) list.push("🔁 続けて引く");
  return list;
}

// おくるんのお知らせカード（line-share の shared/oqrn.js）
export function cardUrl(d) {
  const mode = findMode(d.mode);
  const common = { theme: "custom", customColor: CARD_COLOR, showAction: "true", actionUrl: verifyUrl(d), from: "qji" };
  let params;
  if (d.secret) {
    // ヒミツ：カードには結果を書かない。だれが入っているか（名前）だけ出して、ひらくボタンへ
    const who = (d.input.names || d.input.items || []).slice(0, 12).join("、");
    params = new URLSearchParams({
      headerTitle: `${mode.icon} ${mode.label}`,
      date: "くじ（Qji）",
      showDate: "true",
      title: "🔒 結果はひらくまでヒミツ",
      detail: (who ? `参加：${who}\n` : "") + "せーので、みんなでひらいてね🎁",
      actionLabel: "🎁 ひらく",
      ...common
    });
  } else {
    const sum = summary(d.input, d.result);
    params = new URLSearchParams({
      headerTitle: `${mode.icon} ${mode.label}の結果`,
      date: "くじ（Qji）で決めました",
      showDate: "true",
      title: sum.title.slice(0, 60),
      detail: sum.lines.join("\n").slice(0, 300),
      actionLabel: "🔍 くじで確かめる",
      ...common
    });
  }
  badges(d, mode).forEach((badge) => params.append("badge", badge));
  // おくるんの部品が読めない（電波なしなど）ときは、送るボタンだけ使えない
  return window.OQRN ? window.OQRN.cardUrl(params) : "#";
}
