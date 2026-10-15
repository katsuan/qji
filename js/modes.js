// 決め方（モード）の一覧と、小さな共通の道具

export const MODES = [
  { key: "lottery", icon: "🎟️", label: "くじびき" },
  { key: "amida", icon: "🪜", label: "あみだ" },
  { key: "roulette", icon: "🎡", label: "ルーレット" },
  { key: "number", icon: "🔢", label: "数字" },
  { key: "topic", icon: "💬", label: "お題" },
  { key: "penalty", icon: "😈", label: "罰ゲーム" }
];

export const findMode = (key) => MODES.find((m) => m.key === key);
export const isMode = (key) => MODES.some((m) => m.key === key);
export const teamName = (i) => `チーム${"ABCDEFGHIJ"[i]}`;

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
