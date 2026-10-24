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
import { draw } from "./js/draw.js?v=202610241428";
import { renderForm, renderModes } from "./js/form.js?v=202610241428";
import { readLink, verifyUrl } from "./js/link.js?v=202610241428";
import { $ } from "./js/modes.js?v=202610241428";
import { renderProblem, renderResult, renderSealed } from "./js/result.js?v=202610241428";
import { newSeed } from "./js/rng.js?v=202610241428";
import { MAX_USED, clampInt, currentInput, getValue, problem, saveState, setValue, state } from "./js/state.js?v=202610241428";

const data = { topics: null, penalties: null }; // お題・罰ゲーム（data/*.json）
let lastDraw = null; // { mode, seed, input, time, result, secret }

function pickMode(key) {
  state.mode = key;
  showDrawError("");
  saveState();
  renderModes(pickMode);
  renderForm(data);
  $("result").hidden = true;
  lastDraw = null;
}

// ---- 入力 ----
// まだ引けない理由は、入力のすぐ下（引くボタンの上）に赤い文字で。入れ直したら消す
function showDrawError(reason) {
  $("drawError").textContent = reason;
  $("drawError").hidden = !reason;
}

$("form").addEventListener("input", (event) => {
  showDrawError("");
  const el = event.target.closest("[data-bind]");
  if (!el) return;
  setValue(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
  if (el.type === "checkbox") renderForm(data);
});

// 出た数字のリセット：聞かずに消して、「元に戻す」を出す
function resetUsed() {
  const before = [...(getValue("number.used") || [])];
  setValue("number.used", []);
  renderForm(data);
  window.LineShareUI?.toast("出た数字をリセットしました", {
    actionLabel: "元に戻す",
    onAction: () => {
      setValue("number.used", before);
      renderForm(data);
    }
  });
}

// −・＋のボタン：となりの数の欄を1つずつ（欄の min〜max の中で）
function stepValue(step) {
  const bind = step.dataset.step;
  const input = $("form").querySelector(`[data-bind="${bind}"]`);
  const now = Number(getValue(bind));
  const next = clampInt(now + Number(step.dataset.delta), Number(input.min), Number(input.max), now);
  setValue(bind, next);
  input.value = next;
}

$("form").addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-used]")) return resetUsed();
  const chip = event.target.closest("[data-chip]");
  if (chip) {
    showDrawError("");
    setValue(chip.dataset.chip, chip.dataset.value);
    renderForm(data);
    return;
  }
  const step = event.target.closest("[data-step]");
  if (step) stepValue(step);
});

// ---- 引く！ ----
let drawnAt = 0; // すぐの二度押しで引き直さない（続けて引くとき、数字が2回ぶん出てしまうため）
$("drawButton").addEventListener("click", () => {
  if (Date.now() - drawnAt < 700) return;
  const mode = state.mode;
  const input = currentInput(mode);
  const reason = problem(mode, input, data);
  showDrawError(reason);
  if (reason) {
    $("result").hidden = true;
    return;
  }
  drawnAt = Date.now();
  const seed = newSeed();
  lastDraw = { mode, seed, input, time: Date.now(), result: draw(mode, input, seed, data), secret: $("secretToggle").checked };
  // ビンゴのように続けて引くときは、出た数字をためておく（次に引くときに外す）
  if (mode === "number" && state.number.keep) {
    setValue("number.used", [...(state.number.used || []), ...lastDraw.result.nums].slice(-MAX_USED));
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
    if (window.LineShareUI?.toast) window.LineShareUI.toast(window.QSeason ? QSeason.decorate("確かめるリンクをコピーしました") : "確かめるリンクをコピーしました"); // 季節の絵文字をときどき
    else $("status").textContent = "確かめるリンクをコピーしました。";
  } catch {
    // コピーできないとき：長押しで選べる文字で出す（ブラウザの小窓は使わない）
    window.LineShareUI?.ask({ title: "長押ししてコピーしてね", input: url, readonly: true, ok: "閉じる", cancel: null });
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
    lastDraw = readLink(r, data);
    state.mode = lastDraw.mode;
    renderModes(pickMode);
    renderForm(data);
    // 結果ページ：決め方・入力・引くボタンは隠して、結果だけ見せる（新しく引くときは下のボタンから）
    document.body.classList.add("is-result-page");
    if (lastDraw.secret) renderSealed(lastDraw);
    else renderResult(lastDraw, { verified: true });
  } catch (error) {
    console.error(error);
    renderProblem("確かめるリンクを読めませんでした。リンクが途中で切れていないか、見てみてね。");
  }
}

// 確かめるリンクで開いたとき、お題を読みこむあいだは結果と同じ大きさの箱を出しておく（入力の画面を見せない）
function showLoading() {
  document.body.classList.add("is-result-page");
  $("result").hidden = false;
  $("resultBody").innerHTML = '<div class="ls-skeleton" style="height:220px" aria-label="読みこみ中"></div>';
  $("sendButton").hidden = true;
  $("copyButton").hidden = true;
}

async function init() {
  const r = new URLSearchParams(location.search).get("r");
  if (r) {
    // 結果のリンクには名前が入るので、検索に出さない
    document.head.append(Object.assign(document.createElement("meta"), { name: "robots", content: "noindex" }));
    showLoading();
  }
  renderModes(pickMode);
  renderForm(data);
  // はじめての人にだけ、使い方を3つ（結果を見に来た人には出さない）
  if (!r)
    window.LineShareUI?.firstTip(
      "qji",
      ["決め方を選んで、名前などを入れます", "「🎟️ 引く！」で決まります。🙈 ヒミツで引くと、受け取った人が「ひらく」まで見えません", "💬 カードで送ると、だれが開いても同じ結果を確かめられます"],
      $("modes")
    );
  await loadData();
  renderForm(data); // お題・罰ゲームの種類を出す
  if (r) openLink(r);
}

init();
