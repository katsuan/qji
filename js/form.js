// 画面：決め方のボタンと、モードごとの入力
import { $, MODES, esc } from "./modes.js?v=202610222216";
import { state } from "./state.js?v=202610222216";

// onPick(key)：決め方のボタンを押したとき
export function renderModes(onPick) {
  $("modes").innerHTML = "";
  MODES.forEach((m) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode" + (m.key === state.mode ? " is-active" : "");
    button.setAttribute("aria-pressed", String(m.key === state.mode));
    button.innerHTML = `<span aria-hidden="true">${m.icon}</span>${m.label}`; // qcheck-ok: W1 決まった一覧（MODES）の文字だけ
    button.addEventListener("click", () => onPick(m.key));
    $("modes").append(button);
  });
}

function namesField(label = "名前（1行に1人）", hint = "前に入れた名前は、この端末に残ります。") {
  return `<label class="ls-field"><span class="ls-label">${label}</span>
    <textarea class="ls-input" data-bind="names" placeholder="たろう&#10;はなこ&#10;じろう">${esc(state.names)}</textarea>
    <p class="ls-hint">${hint}</p></label>`;
}

function chips(bind, options, current) {
  return `<div class="ls-chips">${options
    .map(([value, label]) => `<button type="button" class="ls-chip${value === current ? " is-active" : ""}" aria-pressed="${value === current}" data-chip="${bind}" data-value="${value}">${label}</button>`)
    .join("")}</div>`;
}

function stepper(bind, value, min, max) {
  return `<div class="stepper"><button type="button" data-step="${bind}" data-delta="-1" aria-label="減らす">−</button>
    <input class="ls-input" type="number" inputmode="numeric" data-bind="${bind}" value="${esc(value)}" min="${min}" max="${max}">
    <button type="button" data-step="${bind}" data-delta="1" aria-label="増やす">＋</button></div>`;
}

function categoryChips(bind, json, current) {
  const cats = (json && json.categories) || [];
  return chips(bind, [["all", "ぜんぶ"], ...cats.map((c) => [c.key, c.label])], current);
}

// モードごとの入力の HTML（data はお題・罰ゲームのデータ。種類のボタンに使う）
const FORMS = {
  lottery() {
    const t = state.lottery.type;
    return (
      namesField() +
      `<div class="ls-field"><span class="ls-label">決めること</span>${chips("lottery.type", [["win", "当たりを決める"], ["order", "順番を決める"], ["team", "チームに分ける"]], t)}</div>` +
      (t === "win" ? `<div class="ls-field"><span class="ls-label">当たりの数</span>${stepper("lottery.wins", state.lottery.wins, 1, 39)}</div>` : "") +
      (t === "team" ? `<div class="ls-field"><span class="ls-label">チームの数</span>${stepper("lottery.teams", state.lottery.teams, 2, 10)}</div>` : "")
    );
  },
  amida() {
    return (
      namesField("名前（上に並ぶ人。12人まで）") +
      `<label class="ls-field"><span class="ls-label">ゴール（1行に1つ）</span>
        <textarea class="ls-input" data-bind="amida.goals" placeholder="あたり&#10;はずれ&#10;はずれ">${esc(state.amida.goals)}</textarea>
        <p class="ls-hint">足りない分は「はずれ」になります（入れないときは、1つだけ「あたり」）。</p></label>`
    );
  },
  roulette() {
    return (
      `<label class="check"><input type="checkbox" data-bind="roulette.own" ${state.roulette.own ? "checked" : ""}>名前ではなく、自分で項目を入れる</label>` +
      (state.roulette.own
        ? `<label class="ls-field"><span class="ls-label">ルーレットの項目（1行に1つ）</span>
            <textarea class="ls-input" data-bind="roulette.items" placeholder="ラーメン&#10;カレー&#10;お寿司">${esc(state.roulette.items)}</textarea></label>`
        : namesField("名前（ルーレットに並ぶ人）"))
    );
  },
  number() {
    const n = state.number;
    const used = n.used || [];
    return (
      `<div class="row"><label class="ls-field"><span class="ls-label">いくつから</span><input class="ls-input" type="number" inputmode="numeric" data-bind="number.min" value="${esc(n.min)}"></label>
        <label class="ls-field"><span class="ls-label">いくつまで</span><input class="ls-input" type="number" inputmode="numeric" data-bind="number.max" value="${esc(n.max)}"></label></div>` +
      `<div class="ls-field"><span class="ls-label">いくつ出す</span>${stepper("number.count", n.count, 1, 20)}</div>` +
      `<label class="check"><input type="checkbox" data-bind="number.unique" ${n.unique || n.keep ? "checked" : ""} ${n.keep ? "disabled" : ""}>1回の中で同じ数字は出さない</label>` +
      `<label class="check"><input type="checkbox" data-bind="number.keep" ${n.keep ? "checked" : ""}>前に出た数字も出さない（ビンゴのように続けて引く）</label>` +
      (n.keep
        ? `<div class="used"><p class="ls-hint">出た数字（${used.length}個）${used.length ? "：" + esc(used.join("・")) : "：まだありません"}</p>` +
          (used.length ? `<button type="button" class="ls-chip is-small" data-reset-used>出た数字をリセット</button>` : "") +
          `</div>`
        : "")
    );
  },
  topic(data) {
    const letter = state.topic.style === "letter";
    return (
      `<div class="ls-field"><span class="ls-label">お題の形</span>${chips("topic.style", [["question", "ふつうのお題"], ["letter", "1文字＋お題"]], state.topic.style)}</div>` +
      (letter
        ? `<p class="ls-hint">「あ」から始まる「魅力的なもの」は？ のように、ひらがな1文字とお題を一緒に引きます。順番に答えたり、早く思いついた人の勝ちにしたり。</p>`
        : `<div class="ls-field"><span class="ls-label">お題の種類</span>${categoryChips("topic.cat", data.topics, state.topic.cat)}</div>
      <p class="ls-hint">会話が止まったとき、自己紹介、飲み会の話のきっかけに。</p>`)
    );
  },
  penalty(data) {
    return (
      `<div class="ls-field"><span class="ls-label">罰ゲームの種類</span>${categoryChips("penalty.cat", data.penalties, state.penalty.cat)}</div>` +
      `<label class="check"><input type="checkbox" data-bind="penalty.who" ${state.penalty.who ? "checked" : ""}>だれがやるかも決める</label>` +
      (state.penalty.who ? namesField() : "") +
      `<p class="ls-hint">その場が楽しくなる軽いものだけ。無理はしないでね。</p>`
    );
  }
};

export function renderForm(data) {
  $("form").innerHTML = (FORMS[state.mode] || (() => ""))(data);
}
