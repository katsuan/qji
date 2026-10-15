// くじ（Qji）：くじ引き・あみだ・ルーレット・数字・お題・罰ゲームを、その場で公平に決める。
//
// 公平さ：引くたびにランダムな「タネ」を1つ作り、タネと入力（名前など）だけから結果を決める（乱数は mulberry32）。
// 「確かめるリンク」（?r=…）にはモード・タネ・入力を入れておき、開くと同じタネで引き直す＝だれが開いても同じ結果になる。
// 結果はおくるんのお知らせカード（/card/）に渡して LINE に送る。カードのボタンは確かめるリンク。
(function () {
  "use strict";

  const PAGE_URL = "https://katsuan.github.io/qji/";
  const OQRN_CARD = "https://liff.line.me/2009927876-DioOJd0z/card/"; // おくるんのお知らせカード
  const CARD_COLOR = "#E23E4A"; // ロゴのコーラルの赤
  const STORAGE_KEY = "qji:state";
  const $ = (id) => document.getElementById(id);

  // ---- 決め方（モード） ----
  const MODES = [
    { key: "lottery", icon: "🎟️", label: "くじびき" },
    { key: "amida", icon: "🪜", label: "あみだ" },
    { key: "roulette", icon: "🎡", label: "ルーレット" },
    { key: "number", icon: "🔢", label: "数字" },
    { key: "topic", icon: "💬", label: "お題" },
    { key: "penalty", icon: "😈", label: "罰ゲーム" }
  ];

  const DEFAULTS = {
    mode: "lottery",
    names: "",
    lottery: { type: "win", wins: 1, teams: 2 },
    amida: { goals: "" },
    roulette: { own: false, items: "" },
    number: { min: 1, max: 100, count: 1, unique: true },
    topic: { cat: "all", style: "question" }, // style：question（ふつうのお題）か letter（「あ」から始まる「〇〇」は？）
    penalty: { cat: "all", who: true }
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return mergeState(saved);
    } catch {
      return mergeState({});
    }
  }

  function mergeState(saved) {
    const state = structuredClone(DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) {
      if (saved[key] == null) continue;
      state[key] = typeof DEFAULTS[key] === "object" ? { ...DEFAULTS[key], ...saved[key] } : saved[key];
    }
    if (!MODES.some((m) => m.key === state.mode)) state.mode = DEFAULTS.mode;
    return state;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 保存できない環境でも、開いているあいだは使える
    }
  }

  let state = loadState();
  let lastDraw = null; // { mode, seed, input, result }
  let data = { topics: null, penalties: null };

  // ---- 乱数（タネから決まる） ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newSeed() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }

  function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const lines = (text) =>
    String(text || "")
      .split(/\r?\n|、|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  // ---- 入力（モードごとに、引くのに使うものだけ） ----
  function currentInput(mode) {
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
        return { min: Math.min(min, max), max: Math.max(min, max), count: clampInt(state.number.count, 1, 20, 1), unique: Boolean(state.number.unique) };
      }
      case "topic":
        return state.topic.style === "letter" ? { style: "letter" } : { cat: state.topic.cat };
      case "penalty":
        return { cat: state.penalty.cat, names: state.penalty.who ? names : [] };
      default:
        return {};
    }
  }

  // 引けるかどうか（引けないときは理由）
  function problem(mode, input) {
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
    if (mode === "number" && input.unique && input.count > input.max - input.min + 1) return "重ならない数字が足りません。範囲を広げるか、数を減らしてください。";
    if ((mode === "topic" && !data.topics) || (mode === "penalty" && !data.penalties)) return "お題を読み込み中です。少し待ってからもう一度。";
    return "";
  }

  function pool(json, cat) {
    const cats = (json && json.categories) || [];
    const chosen = cat === "all" ? cats : cats.filter((c) => c.key === cat);
    return chosen.flatMap((c) => c.items.map((text) => ({ text, cat: c.label })));
  }

  // ---- 引く（タネと入力だけから結果を決める） ----
  function draw(mode, input, seed) {
    const rand = mulberry32(seed);
    switch (mode) {
      case "lottery": {
        const order = shuffle(input.names, rand);
        if (input.type === "order") return { kind: "order", order };
        if (input.type === "team") {
          const teams = Array.from({ length: input.teams }, () => []);
          order.forEach((name, i) => teams[i % input.teams].push(name));
          return { kind: "team", teams };
        }
        return { kind: "win", winners: order.slice(0, input.wins), losers: order.slice(input.wins) };
      }
      case "amida":
        return amida(input.names, input.goals, rand);
      case "roulette":
        return { kind: "roulette", items: input.items, index: Math.floor(rand() * input.items.length) };
      case "number": {
        const nums = [];
        const range = input.max - input.min + 1;
        if (input.unique) {
          const picked = new Set();
          while (nums.length < input.count) {
            const n = input.min + Math.floor(rand() * range);
            if (!picked.has(n)) {
              picked.add(n);
              nums.push(n);
            }
          }
        } else {
          for (let i = 0; i < input.count; i += 1) nums.push(input.min + Math.floor(rand() * range));
        }
        return { kind: "number", nums };
      }
      case "topic": {
        if (input.style === "letter") {
          // 1文字＋お題：ひらがな1文字と、お題を1つずつ
          const { letters, prompts } = data.topics.letter;
          return { kind: "letter", letter: letters[Math.floor(rand() * letters.length)], prompt: prompts[Math.floor(rand() * prompts.length)] };
        }
        const list = pool(data.topics, input.cat);
        return { kind: "topic", pick: list[Math.floor(rand() * list.length)] };
      }
      case "penalty": {
        const list = pool(data.penalties, input.cat);
        const pick = list[Math.floor(rand() * list.length)];
        const who = input.names.length ? input.names[Math.floor(rand() * input.names.length)] : "";
        return { kind: "penalty", pick, who };
      }
      default:
        return null;
    }
  }

  // あみだ：縦の線（人数ぶん）と、となり合う線をつなぐ横の線。横の線は同じ高さで並ばない
  function amida(names, goalsIn, rand) {
    const n = names.length;
    const goals = Array.from({ length: n }, (_, i) => goalsIn[i] || (i === 0 ? "あたり" : "はずれ"));
    const levels = Math.max(8, n * 3);
    const rungs = []; // [level, col]：col と col+1 をつなぐ
    for (let level = 0; level < levels; level += 1) {
      for (let col = 0; col < n - 1; col += 1) {
        const left = rungs.some(([l, c]) => l === level && c === col - 1);
        if (!left && rand() < 0.42) rungs.push([level, col]);
      }
    }
    // 上から下へたどる
    const paths = names.map((_, start) => {
      let col = start;
      const steps = [[col, -1]];
      for (let level = 0; level < levels; level += 1) {
        if (rungs.some(([l, c]) => l === level && c === col)) {
          steps.push([col, level], [col + 1, level]);
          col += 1;
        } else if (rungs.some(([l, c]) => l === level && c === col - 1)) {
          steps.push([col, level], [col - 1, level]);
          col -= 1;
        }
      }
      steps.push([col, levels]);
      return { end: col, steps };
    });
    return { kind: "amida", names, goals, levels, rungs, paths };
  }

  // ---- 結果を文字に（LINE のカード・コピー用） ----
  function summary(mode, input, result) {
    switch (result.kind) {
      case "win":
        return { title: `当たり：${result.winners.join("・")}`, lines: [`当たり（${result.winners.length}）：${result.winners.join("、")}`, `はずれ：${result.losers.join("、")}`] };
      case "order":
        return { title: `1番は ${result.order[0]}`, lines: result.order.map((name, i) => `${i + 1}. ${name}`) };
      case "team":
        return { title: `${result.teams.length}チームに分けました`, lines: result.teams.map((t, i) => `${teamName(i)}：${t.join("、")}`) };
      case "amida":
        return { title: "あみだの結果", lines: result.paths.map((p, i) => `${result.names[i]} → ${result.goals[p.end]}`) };
      case "roulette":
        return { title: `🎡 ${result.items[result.index]}`, lines: [`候補：${result.items.join("、")}`] };
      case "number":
        return { title: result.nums.join("・"), lines: [`${input.min}〜${input.max} から ${result.nums.length}つ${input.unique ? "（重ならない）" : ""}`] };
      case "topic":
        return { title: `💬 ${result.pick.text}`, lines: [`会話のお題（${result.pick.cat}）`] };
      case "letter":
        return { title: `「${result.letter}」から始まる「${result.prompt}」は？`, lines: ["1文字＋お題"] };
      case "penalty":
        return { title: `${result.who ? result.who + "：" : ""}${result.pick.text}`, lines: [`罰ゲーム（${result.pick.cat}）`] };
      default:
        return { title: "", lines: [] };
    }
  }

  const teamName = (i) => `チーム${"ABCDEFGHIJ"[i]}`;

  // ---- 確かめるリンク（?r=<base64url(JSON)>） ----
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decode(text) {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  }

  // h: 1 はヒミツで引いたもの（開いた人が「ひらく」を押すまで結果を見せない）
  function verifyUrl(d) {
    return `${PAGE_URL}?r=${encode({ m: d.mode, s: d.seed, i: d.input, t: d.time, ...(d.secret ? { h: 1 } : {}) })}`;
  }

  function cardUrl(d) {
    const sum = summary(d.mode, d.input, d.result);
    const mode = MODES.find((m) => m.key === d.mode);
    const detail = sum.lines.join("\n").slice(0, 300);
    if (d.secret) {
      // ヒミツ：カードには結果を書かない。だれが入っているか（名前）だけ出して、ひらくボタンへ
      const who = (d.input.names || d.input.items || []).slice(0, 12).join("、");
      const params = new URLSearchParams({
        headerTitle: `${mode.icon} ${mode.label}`,
        date: "くじ（Qji）",
        showDate: "true",
        title: "🔒 結果はひらくまでヒミツ",
        detail: (who ? `参加：${who}\n` : "") + "せーので、みんなでひらいてね🎁",
        theme: "custom",
        customColor: CARD_COLOR,
        showAction: "true",
        actionLabel: "🎁 ひらく",
        actionUrl: verifyUrl(d),
        from: "qji"
      });
      return `${OQRN_CARD}?${params}`;
    }
    const params = new URLSearchParams({
      headerTitle: `${mode.icon} ${mode.label}の結果`,
      date: "くじ（Qji）で決めました",
      showDate: "true",
      title: sum.title.slice(0, 60),
      detail,
      theme: "custom",
      customColor: CARD_COLOR,
      showAction: "true",
      actionLabel: "🔍 くじで確かめる",
      actionUrl: verifyUrl(d),
      from: "qji"
    });
    return `${OQRN_CARD}?${params}`;
  }

  // ---- 画面：決め方のボタン ----
  function renderModes() {
    $("modes").innerHTML = "";
    MODES.forEach((m) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mode" + (m.key === state.mode ? " is-active" : "");
      button.setAttribute("aria-pressed", String(m.key === state.mode));
      button.innerHTML = `<span aria-hidden="true">${m.icon}</span>${m.label}`;
      button.addEventListener("click", () => {
        state.mode = m.key;
        saveState();
        renderModes();
        renderForm();
        hideResult();
      });
      $("modes").append(button);
    });
  }

  // ---- 画面：入力（モードごと） ----
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function namesField(label = "名前（1行に1人）", hint = "前に入れた名前は、この端末に残ります。") {
    return `<label class="field"><span class="label">${label}</span>
      <textarea data-bind="names" placeholder="たろう&#10;はなこ&#10;じろう">${esc(state.names)}</textarea>
      <p class="hint">${hint}</p></label>`;
  }

  function chips(bind, options, current) {
    return `<div class="chips">${options
      .map(([value, label]) => `<button type="button" class="chip${value === current ? " is-active" : ""}" data-chip="${bind}" data-value="${value}">${label}</button>`)
      .join("")}</div>`;
  }

  function stepper(bind, value, min, max) {
    return `<div class="stepper"><button type="button" data-step="${bind}" data-delta="-1" aria-label="減らす">−</button>
      <input type="number" inputmode="numeric" data-bind="${bind}" value="${esc(value)}" min="${min}" max="${max}">
      <button type="button" data-step="${bind}" data-delta="1" aria-label="増やす">＋</button></div>`;
  }

  function categoryChips(bind, json, current) {
    const cats = (json && json.categories) || [];
    return chips(bind, [["all", "ぜんぶ"], ...cats.map((c) => [c.key, c.label])], current);
  }

  function renderForm() {
    const form = $("form");
    const m = state.mode;
    if (m === "lottery") {
      const t = state.lottery.type;
      form.innerHTML =
        namesField() +
        `<div class="field"><span class="label">決めること</span>${chips("lottery.type", [["win", "当たりを決める"], ["order", "順番を決める"], ["team", "チームに分ける"]], t)}</div>` +
        (t === "win" ? `<div class="field"><span class="label">当たりの数</span>${stepper("lottery.wins", state.lottery.wins, 1, 39)}</div>` : "") +
        (t === "team" ? `<div class="field"><span class="label">チームの数</span>${stepper("lottery.teams", state.lottery.teams, 2, 10)}</div>` : "");
    } else if (m === "amida") {
      form.innerHTML =
        namesField("名前（上に並ぶ人。12人まで）") +
        `<label class="field"><span class="label">ゴール（1行に1つ）</span>
          <textarea data-bind="amida.goals" placeholder="あたり&#10;はずれ&#10;はずれ">${esc(state.amida.goals)}</textarea>
          <p class="hint">足りない分は「はずれ」になります（入れないときは、1つだけ「あたり」）。</p></label>`;
    } else if (m === "roulette") {
      form.innerHTML =
        `<label class="check"><input type="checkbox" data-bind="roulette.own" ${state.roulette.own ? "checked" : ""}>名前ではなく、自分で項目を入れる</label>` +
        (state.roulette.own
          ? `<label class="field"><span class="label">ルーレットの項目（1行に1つ）</span>
              <textarea data-bind="roulette.items" placeholder="ラーメン&#10;カレー&#10;お寿司">${esc(state.roulette.items)}</textarea></label>`
          : namesField("名前（ルーレットに並ぶ人）"));
    } else if (m === "number") {
      const n = state.number;
      form.innerHTML =
        `<div class="row"><label class="field"><span class="label">いくつから</span><input type="number" inputmode="numeric" data-bind="number.min" value="${esc(n.min)}"></label>
          <label class="field"><span class="label">いくつまで</span><input type="number" inputmode="numeric" data-bind="number.max" value="${esc(n.max)}"></label></div>` +
        `<div class="field"><span class="label">いくつ出す</span>${stepper("number.count", n.count, 1, 20)}</div>` +
        `<label class="check"><input type="checkbox" data-bind="number.unique" ${n.unique ? "checked" : ""}>同じ数字は出さない</label>`;
    } else if (m === "topic") {
      const letter = state.topic.style === "letter";
      form.innerHTML =
        `<div class="field"><span class="label">お題の形</span>${chips("topic.style", [["question", "ふつうのお題"], ["letter", "1文字＋お題"]], state.topic.style)}</div>` +
        (letter
          ? `<p class="hint">「あ」から始まる「魅力的なもの」は？ のように、ひらがな1文字とお題を一緒に引きます。順番に答えたり、早く思いついた人の勝ちにしたり。</p>`
          : `<div class="field"><span class="label">お題の種類</span>${categoryChips("topic.cat", data.topics, state.topic.cat)}</div>
        <p class="hint">会話が止まったとき、自己紹介、飲み会の話のきっかけに。</p>`);
    } else if (m === "penalty") {
      form.innerHTML =
        `<div class="field"><span class="label">罰ゲームの種類</span>${categoryChips("penalty.cat", data.penalties, state.penalty.cat)}</div>` +
        `<label class="check"><input type="checkbox" data-bind="penalty.who" ${state.penalty.who ? "checked" : ""}>だれがやるかも決める</label>` +
        (state.penalty.who ? namesField() : "") +
        `<p class="hint">その場が楽しくなる軽いものだけ。無理はしないでね。</p>`;
    }
  }

  // 入力を state に反映（"lottery.wins" のような書き方で、モードごとの値も）
  function setValue(bind, value) {
    const [a, b] = bind.split(".");
    if (b) state[a][b] = value;
    else state[a] = value;
    saveState();
  }

  function getValue(bind) {
    const [a, b] = bind.split(".");
    return b ? state[a][b] : state[a];
  }

  $("form").addEventListener("input", (event) => {
    const el = event.target.closest("[data-bind]");
    if (!el) return;
    setValue(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    if (el.type === "checkbox") renderForm();
  });

  $("form").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-chip]");
    if (chip) {
      setValue(chip.dataset.chip, chip.dataset.value);
      renderForm();
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

  // ---- 画面：結果 ----
  function hideResult() {
    $("result").hidden = true;
    lastDraw = null;
  }

  function renderResult(d, { verified = false, opened = false } = {}) {
    $("sendButton").hidden = false;
    $("copyButton").hidden = false;
    const body = $("resultBody");
    const r = d.result;
    const mode = MODES.find((m) => m.key === d.mode);
    let html = `<p class="result-title">${mode.icon} ${mode.label}の結果</p>`;
    if (r.kind === "win") {
      html += `<p class="big">🎉 ${esc(r.winners.join("・"))}</p><ul class="list">${r.winners
        .map((n) => `<li class="is-win"><span class="no">当</span>${esc(n)}</li>`)
        .join("")}${r.losers.map((n) => `<li><span class="no">・</span>${esc(n)}</li>`).join("")}</ul>`;
    } else if (r.kind === "order") {
      html += `<ul class="list">${r.order.map((n, i) => `<li${i === 0 ? ' class="is-win"' : ""}><span class="no">${i + 1}</span>${esc(n)}</li>`).join("")}</ul>`;
    } else if (r.kind === "team") {
      html += `<div class="teams">${r.teams.map((t, i) => `<div class="team"><h3>${teamName(i)}</h3><p>${t.map(esc).join("<br>")}</p></div>`).join("")}</div>`;
    } else if (r.kind === "amida") {
      html += amidaSvg(r) + `<ul class="list">${r.paths.map((p, i) => `<li${/あたり|当/.test(r.goals[p.end]) ? ' class="is-win"' : ""}><span class="no">${i + 1}</span>${esc(r.names[i])} → ${esc(r.goals[p.end])}</li>`).join("")}</ul>`;
    } else if (r.kind === "roulette") {
      html += wheelSvg(r) + `<p class="big" id="rouletteWinner" hidden>🎡 ${esc(r.items[r.index])}</p>`;
    } else if (r.kind === "number") {
      html += `<div class="numbers">${r.nums.map((n) => `<b>${n}</b>`).join("")}</div>`;
    } else if (r.kind === "letter") {
      html += `<p class="letter-q"><span class="letter-char">${esc(r.letter)}</span><span class="letter-text">から始まる<br><b>${esc(r.prompt)}</b> は？</span></p>`;
    } else if (r.kind === "topic") {
      html += `<p class="big">${esc(r.pick.text)}</p><p class="hint" style="text-align:center">${esc(r.pick.cat)}</p>`;
    } else if (r.kind === "penalty") {
      html += (r.who ? `<p class="who">😈 ${esc(r.who)} さん</p>` : "") + `<p class="big">${esc(r.pick.text)}</p>`;
    }
    body.innerHTML = html;
    $("verifyNote").hidden = !verified;
    if (verified) {
      const when = d.time ? new Date(d.time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      $("verifyNote").textContent = opened
        ? `🎁 ${when ? when + " に引いた" : ""}ヒミツの結果です。だれが開いても同じ結果になります。`
        : `🔍 確かめるリンクの結果です。${when ? when + " に引いたのと " : ""}同じタネ・同じ条件で引き直すと、必ずこの結果になります。`;
    }
    $("seedNote").textContent = `タネ：${d.seed.toString(16).padStart(8, "0")}`;
    $("sendButton").href = cardUrl(d);
    $("status").textContent = "";
    $("result").hidden = false;
    // 結果が見えるところまで送る
    requestAnimationFrame(() => $("result").scrollIntoView({ behavior: "smooth", block: "start" }));
    if (r.kind === "roulette") spinWheel(r);
    if (r.kind === "amida") animateAmida();
  }

  // あみだの図（SVG）。線は上から順に色付きでなぞる
  const PATH_COLORS = ["#e23e4a", "#2f8fe0", "#22a86a", "#f5a524", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#a855f7"];
  function amidaSvg(r) {
    const n = r.names.length;
    const W = 320, top = 34, bottom = 34, gapX = W / n, H = top + bottom + r.levels * 22;
    const x = (col) => gapX * (col + 0.5);
    const y = (level) => (level < 0 ? top : level >= r.levels ? H - bottom : top + (level + 0.5) * 22);
    const label = (text, cx, cy) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${n > 8 ? 10 : 12}" fill="#3a2a2b">${esc(String(text).slice(0, 6))}</text>`;
    let svg = `<svg class="amida" viewBox="0 0 ${W} ${H}" role="img" aria-label="あみだくじ">`;
    for (let c = 0; c < n; c += 1) svg += `<line class="rail" x1="${x(c)}" y1="${top}" x2="${x(c)}" y2="${H - bottom}"/>`;
    r.rungs.forEach(([l, c]) => (svg += `<line class="rail" x1="${x(c)}" y1="${y(l)}" x2="${x(c + 1)}" y2="${y(l)}"/>`));
    r.paths.forEach((p, i) => {
      const d = p.steps.map(([c, l], k) => `${k ? "L" : "M"}${x(c)} ${y(l)}`).join("");
      svg += `<path class="path" d="${d}" stroke="${PATH_COLORS[i % PATH_COLORS.length]}" data-amida-path/>`;
    });
    r.names.forEach((name, c) => (svg += label(name, x(c), 20)));
    r.goals.forEach((goal, c) => (svg += label(goal, x(c), H - 12)));
    return svg + "</svg>";
  }

  function animateAmida() {
    const paths = [...document.querySelectorAll("[data-amida-path]")];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.style.transition = `stroke-dashoffset 0.9s ease ${i * 0.35}s`;
      requestAnimationFrame(() => requestAnimationFrame(() => (p.style.strokeDashoffset = "0")));
    });
  }

  // ルーレットの図（SVG）。止まる位置は結果（index）から決める
  const WHEEL_COLORS = ["#ff8a7a", "#ffd166", "#7fd1ae", "#7cb8f2", "#c4a3f7", "#f9a8d4", "#a3e635", "#fdba74"];
  function wheelSvg(r) {
    const n = r.items.length;
    const R = 150, c = 160;
    let svg = `<div class="wheel-box"><span class="wheel-pointer" aria-hidden="true">▼</span><svg class="wheel" viewBox="0 0 320 320" role="img" aria-label="ルーレット"><g class="wheel-spin" id="wheelSpin">`;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
      const p = (a) => `${c + R * Math.cos(a)} ${c + R * Math.sin(a)}`;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      svg += `<path d="M${c} ${c}L${p(a0)}A${R} ${R} 0 ${large} 1 ${p(a1)}Z" fill="${WHEEL_COLORS[i % WHEEL_COLORS.length]}" stroke="#fff" stroke-width="3"/>`;
      const am = (a0 + a1) / 2, tx = c + R * 0.62 * Math.cos(am), ty = c + R * 0.62 * Math.sin(am);
      svg += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="${n > 10 ? 11 : 14}" font-weight="700" fill="#3a2a2b" transform="rotate(${(am * 180) / Math.PI + 90} ${tx} ${ty})">${esc(String(r.items[i]).slice(0, 7))}</text>`;
    }
    return svg + `</g><circle cx="${c}" cy="${c}" r="18" fill="#fff" stroke="#e23e4a" stroke-width="4"/></svg></div>`;
  }

  function spinWheel(r) {
    const g = $("wheelSpin");
    const seg = 360 / r.items.length;
    const target = 360 * 6 - (r.index + 0.5) * seg; // 選ばれた項目の真ん中が、上の ▼ に来る
    const show = () => ($("rouletteWinner").hidden = false);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      g.style.transform = `rotate(${target}deg)`;
      show();
      return;
    }
    g.style.transform = "rotate(0deg)";
    requestAnimationFrame(() => requestAnimationFrame(() => (g.style.transform = `rotate(${target}deg)`)));
    g.addEventListener("transitionend", show, { once: true });
  }

  // ---- 引く！ ----
  $("drawButton").addEventListener("click", () => {
    const mode = state.mode;
    const input = currentInput(mode);
    const reason = problem(mode, input);
    if (reason) {
      $("result").hidden = false;
      $("resultBody").innerHTML = `<p class="hint" style="text-align:center">${esc(reason)}</p>`;
      $("verifyNote").hidden = true;
      $("seedNote").textContent = "";
      $("sendButton").removeAttribute("href");
      return;
    }
    const seed = newSeed();
    lastDraw = { mode, seed, input, time: Date.now(), result: draw(mode, input, seed), secret: $("secretToggle").checked };
    if (lastDraw.secret) renderSealed(lastDraw, { sender: true });
    else renderResult(lastDraw);
  });

  // ヒミツで引いたとき：結果を伏せた札を見せる。送る人には「送る」ボタン、受け取った人には「ひらく」ボタン
  function renderSealed(d, { sender = false } = {}) {
    const mode = MODES.find((m) => m.key === d.mode);
    $("resultBody").innerHTML =
      `<p class="result-title">${mode.icon} ${mode.label}</p>` +
      `<div class="sealed"><span class="sealed-mark" aria-hidden="true">🔒</span><p class="sealed-text">結果はヒミツ</p>` +
      (sender
        ? `<p class="hint">あなたにも見えていません。LINE で送って、みんなで「ひらく」を押してね。</p>`
        : `<p class="hint">せーので、ひらいてね</p><button id="openSealed" class="btn open-sealed" type="button">🎁 ひらく</button>`) +
      `</div>`;
    $("verifyNote").hidden = true;
    $("seedNote").textContent = "";
    $("sendButton").href = cardUrl(d);
    $("sendButton").hidden = !sender;
    $("copyButton").hidden = !sender;
    $("copyButton").textContent = "🔗 ひらくリンクをコピー";
    $("status").textContent = "";
    $("result").hidden = false;
    requestAnimationFrame(() => $("result").scrollIntoView({ behavior: "smooth", block: "start" }));
    if (!sender) {
      $("openSealed").addEventListener("click", () => {
        $("sendButton").hidden = false;
        $("copyButton").hidden = false;
        $("copyButton").textContent = "🔗 確かめるリンクをコピー";
        renderResult({ ...d, secret: false }, { verified: true, opened: true });
      });
    }
  }

  $("sendButton").addEventListener("click", (event) => {
    if (!lastDraw) event.preventDefault();
  });

  $("copyButton").addEventListener("click", async () => {
    if (!lastDraw) return;
    const url = verifyUrl(lastDraw);
    try {
      await navigator.clipboard.writeText(url);
      $("status").textContent = "確かめるリンクをコピーしました。";
    } catch {
      window.prompt("このリンクをコピーしてください", url);
    }
  });

  // ---- はじめに ----
  async function loadData() {
    const get = (path) => fetch(path, { cache: "no-cache" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    [data.topics, data.penalties] = await Promise.all([get("data/topics.json"), get("data/penalties.json")]);
  }

  async function init() {
    renderModes();
    renderForm();
    await loadData();
    renderForm(); // お題・罰ゲームの種類を出す
    // 確かめるリンク（?r=）で開いたとき：同じタネ・同じ条件で引き直す
    const r = new URLSearchParams(location.search).get("r");
    if (!r) return;
    try {
      const v = decode(r);
      if (!MODES.some((m) => m.key === v.m)) throw new Error("mode");
      const input = v.i || {};
      const result = draw(v.m, input, v.s >>> 0);
      if (!result) throw new Error("draw");
      state.mode = v.m;
      renderModes();
      renderForm();
      lastDraw = { mode: v.m, seed: v.s >>> 0, input, time: v.t, result, secret: v.h === 1 };
      if (lastDraw.secret) renderSealed(lastDraw);
      else renderResult(lastDraw, { verified: true });
    } catch (error) {
      console.error(error);
      $("result").hidden = false;
      $("resultBody").innerHTML = `<p class="hint" style="text-align:center">確かめるリンクを読めませんでした。リンクが途中で切れていないか確かめてください。</p>`;
    }
  }

  init();
})();
