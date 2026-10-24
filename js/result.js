// 画面：結果（ふつうの結果・ヒミツの札・まだ引けないときの理由）。あみだとルーレットの図もここ
import { cardUrl } from "./link.js?v=202610241455";
import { $, esc, findMode, teamName } from "./modes.js?v=202610241455";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function showResultCard() {
  $("status").textContent = "";
  $("result").hidden = false;
  // 結果が見えるところまで送る
  requestAnimationFrame(() => $("result").scrollIntoView({ behavior: "smooth", block: "start" }));
}

function setActions({ send, copyLabel }) {
  $("sendButton").hidden = !send;
  $("copyButton").hidden = !send;
  $("copyButton").textContent = copyLabel;
}

// 結果の中身（モードごと）
const BODIES = {
  win: (r) =>
    `<p class="big">🎉 ${esc(r.winners.join("・"))}</p><ul class="list">${r.winners
      .map((n) => `<li class="is-win"><span class="no">当</span>${esc(n)}</li>`)
      .join("")}${r.losers.map((n) => `<li><span class="no">・</span>${esc(n)}</li>`).join("")}</ul>`,
  order: (r) => `<ul class="list">${r.order.map((n, i) => `<li${i === 0 ? ' class="is-win"' : ""}><span class="no">${i + 1}</span>${esc(n)}</li>`).join("")}</ul>`,
  team: (r) => `<div class="teams">${r.teams.map((t, i) => `<div class="team"><h3>${teamName(i)}</h3><p>${t.map(esc).join("<br>")}</p></div>`).join("")}</div>`,
  amida: (r) =>
    amidaSvg(r) +
    `<ul class="list">${r.paths
      .map((p, i) => `<li${/あたり|当/.test(r.goals[p.end]) ? ' class="is-win"' : ""}><span class="no">${i + 1}</span>${esc(r.names[i])} → ${esc(r.goals[p.end])}</li>`)
      .join("")}</ul>`,
  roulette: (r) => wheelSvg(r) + `<p class="big" id="rouletteWinner" hidden>🎡 ${esc(r.items[r.index])}</p>`,
  number: (r) => `<div class="numbers">${r.nums.map((n) => `<b>${esc(n)}</b>`).join("")}</div>`,
  letter: (r) => `<p class="letter-q"><span class="letter-char">${esc(r.letter)}</span><span class="letter-text">から始まる<br><b>${esc(r.prompt)}</b> は？</span></p>`,
  topic: (r) => `<p class="big">${esc(r.pick.text)}</p><p class="ls-hint" style="text-align:center">${esc(r.pick.cat)}</p>`,
  penalty: (r) => (r.who ? `<p class="who">😈 ${esc(r.who)} さん</p>` : "") + `<p class="big">${esc(r.pick.text)}</p>`
};

// verified：リンクから開いた結果（引いた日時をタネの行に出す）
export function renderResult(d, { verified = false } = {}) {
  const r = d.result;
  const mode = findMode(d.mode);
  setActions({ send: true, copyLabel: "🔗 確かめるリンクをコピー" });
  // qcheck-ok: W1 mode は決まった一覧（MODES）のもの。中身は BODIES の中で esc している
  $("resultBody").innerHTML = `<p class="result-title">${mode.icon} ${mode.label}の結果</p>` + (BODIES[r.kind] || (() => ""))(r);
  $("verifyNote").hidden = true;
  const when = verified && d.time ? new Date(d.time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("seedNote").innerHTML =
    `タネ：${esc((d.seed >>> 0).toString(16)).padStart(8, "0")}${when ? `（${esc(when)} に引いた結果）` : ""}` +
    `<br>同じタネと同じ条件なら、だれが開いても必ずこの結果になります。`;
  $("sendButton").href = cardUrl(d);
  showResultCard();
  if (r.kind === "roulette") spinWheel(r);
  if (r.kind === "amida") animateAmida();
}

// ヒミツで引いたとき：結果を伏せた札。送る人（sender）には「送る」ボタン、受け取った人には「ひらく」ボタン
export function renderSealed(d, { sender = false } = {}) {
  const mode = findMode(d.mode);
  $("resultBody").innerHTML =
    `<p class="result-title">${mode.icon} ${mode.label}</p>` +
    `<div class="sealed"><span class="sealed-mark" aria-hidden="true">🔒</span><p class="sealed-text">結果はヒミツ</p>` +
    (sender
      ? `<p class="ls-hint">あなたにも見えていません。カードで送って、みんなで「ひらく」を押してね。</p>`
      : `<p class="ls-hint">せーので、ひらいてね</p><button id="openSealed" class="ls-button open-sealed" type="button">🎁 ひらく</button>`) +
    `</div>`;
  $("verifyNote").hidden = true;
  $("seedNote").textContent = "";
  $("sendButton").href = cardUrl(d);
  setActions({ send: sender, copyLabel: "🔗 ひらくリンクをコピー" });
  showResultCard();
  if (!sender) $("openSealed").addEventListener("click", () => renderResult({ ...d, secret: false }, { verified: true }));
}

// まだ引けないとき：理由だけを出す
export function renderProblem(reason) {
  $("result").hidden = false;
  $("resultBody").innerHTML = `<p class="ls-hint" style="text-align:center">${esc(reason)}</p>`;
  $("verifyNote").hidden = true;
  $("seedNote").textContent = "";
  $("sendButton").removeAttribute("href");
}

// ---- あみだの図（SVG）。線は上から順に色付きでなぞる ----
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
  if (reduced()) return;
  [...document.querySelectorAll("[data-amida-path]")].forEach((p, i) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    p.style.transition = `stroke-dashoffset 0.9s ease ${i * 0.35}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => (p.style.strokeDashoffset = "0")));
  });
}

// ---- ルーレットの図（SVG）。止まる位置は結果（index）から決める ----
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
  if (reduced()) {
    g.style.transform = `rotate(${target}deg)`;
    show();
    return;
  }
  g.style.transform = "rotate(0deg)";
  requestAnimationFrame(() => requestAnimationFrame(() => (g.style.transform = `rotate(${target}deg)`)));
  g.addEventListener("transitionend", show, { once: true });
}
