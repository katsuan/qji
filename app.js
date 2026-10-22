// くじ（Qji）：くじ引き・あみだ・ルーレット・数字・お題・罰ゲームを、その場で公平に決める。
//
// 公平さ：引くたびにランダムな「タネ」を1つ作り、タネと入力（名前など）だけから結果を決める（js/rng.js・js/draw.js）。
// 「確かめるリンク」（?r=…）にはモード・タネ・入力を入れておき、開くと同じタネで引き直す＝だれが開いても同じ結果になる（js/link.js）。
// 結果はおくるんのお知らせカード（/card/）に渡して LINE に送る。カードのボタンは確かめるリンク。
//
// ファイルの分け方
//   js/modes.js  決め方の一覧・小さな道具      js/rng.js     乱数（タネ）
//   js/state.js  入力の状態・保存・確かめ      js/draw.js    引く・結果の文
//   js/link.js   確かめるリンク・カードの URL  js/form.js    画面：決め方と入力
//   js/result.js 画面：結果・ヒミツの札・図    app.js        操作とはじめ（このファイル）
import { draw } from "./js/draw.js?v=202610221012";
import { renderForm, renderModes } from "./js/form.js?v=202610221012";
import { decode, verifyUrl } from "./js/link.js?v=202610221012";
import { $, isMode } from "./js/modes.js?v=202610221012";
import { renderProblem, renderResult, renderSealed } from "./js/result.js?v=202610221012";
import { newSeed } from "./js/rng.js?v=202610221012";
import { clampInt, currentInput, getValue, problem, saveState, setValue, state } from "./js/state.js?v=202610221012";

const data = { topics: null, penalties: null }; // お題・罰ゲーム（data/*.json）
let lastDraw = null; // { mode, seed, input, time, result, secret }

function pickMode(key) {
  state.mode = key;
  saveState();
  renderModes(pickMode);
  renderForm(data);
  $("result").hidden = true;
  lastDraw = null;
}

// ---- 入力 ----
$("form").addEventListener("input", (event) => {
  const el = event.target.closest("[data-bind]");
  if (!el) return;
  setValue(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
  if (el.type === "checkbox") renderForm(data);
});

$("form").addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-used]")) {
    if (!window.confirm("出た数字をリセットして、はじめから引きますか？")) return;
    setValue("number.used", []);
    renderForm(data);
    return;
  }
  const chip = event.target.closest("[data-chip]");
  if (chip) {
    setValue(chip.dataset.chip, chip.dataset.value);
    renderForm(data);
    return;
  }
  const step = event.target.closest("[data-step]");
  if (step) {
    const bind = step.dataset.step;
    const input = $("form").querySelector(`[data-bind="${bind}"]`);
    const next = clampInt(Number(getValue(bind)) + Number(step.dataset.delta), Number(input.min), Number(input.max), Number(getValue(bind)));
    setValue(bind, next);
    input.value = next;
  }
});

// ---- 引く！ ----
$("drawButton").addEventListener("click", () => {
  const mode = state.mode;
  const input = currentInput(mode);
  const reason = problem(mode, input, data);
  if (reason) {
    renderProblem(reason);
    return;
  }
  const seed = newSeed();
  lastDraw = { mode, seed, input, time: Date.now(), result: draw(mode, input, seed, data), secret: $("secretToggle").checked };
  // ビンゴのように続けて引くときは、出た数字をためておく（次に引くときに外す）
  if (mode === "number" && state.number.keep) {
    setValue("number.used", [...(state.number.used || []), ...lastDraw.result.nums]);
    renderForm(data);
  }
  if (lastDraw.secret) renderSealed(lastDraw, { sender: true });
  else renderResult(lastDraw);
});

$("sendButton").addEventListener("click", (event) => {
  if (!lastDraw) event.preventDefault();
});

$("copyButton").addEventListener("click", async () => {
  if (!lastDraw) return;
  const url = verifyUrl(lastDraw);
  try {
    await navigator.clipboard.writeText(url);
    // 知らせは Q キットのトースト（読めないときは下の文字）
    if (window.LineShareUI?.toast) window.LineShareUI.toast("確かめるリンクをコピーしました");
    else $("status").textContent = "確かめるリンクをコピーしました。";
  } catch {
    window.prompt("このリンクをコピーしてください", url);
  }
});

// ---- はじめに ----
async function loadData() {
  const get = (path) => fetch(path, { cache: "no-cache" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  [data.topics, data.penalties] = await Promise.all([get("data/topics.json"), get("data/penalties.json")]);
}

// 確かめるリンク（?r=）で開いたとき：同じタネ・同じ条件で引き直して、結果だけ見せる
function openLink(r) {
  try {
    const v = decode(r);
    if (!isMode(v.m)) throw new Error("mode");
    const input = v.i || {};
    const result = draw(v.m, input, v.s >>> 0, data);
    if (!result) throw new Error("draw");
    state.mode = v.m;
    renderModes(pickMode);
    renderForm(data);
    lastDraw = { mode: v.m, seed: v.s >>> 0, input, time: v.t, result, secret: v.h === 1 };
    // 結果ページ：決め方・入力・引くボタンは隠して、結果だけ見せる（新しく引くときは下のボタンから）
    document.body.classList.add("is-result-page");
    if (lastDraw.secret) renderSealed(lastDraw);
    else renderResult(lastDraw, { verified: true });
  } catch (error) {
    console.error(error);
    renderProblem("確かめるリンクを読めませんでした。リンクが途中で切れていないか確かめてください。");
  }
}

async function init() {
  renderModes(pickMode);
  renderForm(data);
  await loadData();
  renderForm(data); // お題・罰ゲームの種類を出す
  const r = new URLSearchParams(location.search).get("r");
  if (r) openLink(r);
}

init();
