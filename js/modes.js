// 決め方（モード）の一覧と、小さな共通の道具
// 読まれるところ：app.js とすべての js/（import）

export const MODES = [
  { key: "lottery", icon: "🎟️", label: "くじびき" },
  { key: "amida", icon: "🪜", label: "あみだ" },
  { key: "roulette", icon: "🎡", label: "ルーレット" },
  { key: "number", icon: "🔢", label: "数字" },
  { key: "topic", icon: "💬", label: "お題" },
  { key: "penalty", icon: "😈", label: "罰ゲーム" }
];

// key の決め方（MODES の1つ）を返す
export const findMode = (key) => MODES.find((m) => m.key === key);
// 決め方の key として正しいか
export const isMode = (key) => MODES.some((m) => m.key === key);
// チームの名前（0 → チームA）
export const teamName = (i) => `チーム${"ABCDEFGHIJ"[i]}`;

// id の要素を返す
export const $ = (id) => document.getElementById(id);
// HTML に入れる文字にする（& < > " ' を置きかえる）
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
