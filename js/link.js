// 確かめるリンク（?r=<base64url(JSON)>）と、おくるんで送るカードの URL
// d（引いた結果）は { mode, seed, input, time, result, secret }
import { summary } from "./draw.js?v=202610211350";
import { findMode } from "./modes.js?v=202610211350";

const PAGE_URL = "https://katsuan.github.io/qji/";
const CARD_COLOR = "#E23E4A"; // ロゴのコーラルの赤

export function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
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
  return window.OQRN.cardUrl(params);
}
