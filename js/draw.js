// 引く：タネと入力（とお題のデータ）だけから結果を決める。画面には触らない
import { teamName } from "./modes.js?v=202610241439";
import { mulberry32, shuffle } from "./rng.js?v=202610241439";

// お題・罰ゲームの候補（cat が "all" ならぜんぶの種類から）
function pool(json, cat) {
  const cats = (json && json.categories) || [];
  const chosen = cat === "all" ? cats : cats.filter((c) => c.key === cat);
  return chosen.flatMap((c) => c.items.map((text) => ({ text, cat: c.label })));
}

// data は { topics, penalties }（data/*.json）。お題・罰ゲームのときに使う
export function draw(mode, input, seed, data) {
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
    case "number":
      return { kind: "number", nums: drawNumbers(input, rand) };
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

function drawNumbers(input, rand) {
  const range = input.max - input.min + 1;
  if (input.exclude && input.exclude.length) {
    // 前に出た数字を外した残りから引く
    const skip = new Set(input.exclude);
    const rest = [];
    for (let n = input.min; n <= input.max; n += 1) if (!skip.has(n)) rest.push(n);
    return shuffle(rest, rand).slice(0, input.count);
  }
  const nums = [];
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
  return nums;
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

// 結果を文字に（LINE のカード・コピー用）
export function summary(input, result) {
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
      return {
        title: result.nums.join("・"),
        lines: [`${input.min}〜${input.max} から ${result.nums.length}つ${input.unique ? "（重ならない）" : ""}`, ...(input.exclude ? [`前に出た数字（${input.exclude.length}個）は除いて引きました`] : [])]
      };
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
