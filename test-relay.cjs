const fs = require("fs");
const vm = require("vm");
const path = require("path");

function makeEnv() {
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    dump: () => Object.fromEntries(mem)
  };

  const stubEl = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "addEventListener" || prop === "reset") return () => {};
        if (prop === "files") return [];
        if (prop in target) return target[prop];
        return "";
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    }
  );
  const document = { querySelector: () => stubEl };
  const sandbox = {
    document,
    localStorage,
    window: { confirm: () => true },
    console,
    structuredClone,
    crypto: require("crypto").webcrypto
  };
  vm.createContext(sandbox);
  return { sandbox, localStorage };
}

function loadApp(env) {
  let src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  src += `
    ;globalThis.__app = {
      get state() { return state; },
      get relayStore() { return relayStore; },
      get historyStore() { return historyStore; },
      relayCategories,
      createRelayCard,
      arrivePerson,
      leavePerson,
      tellItem,
      finishSlot,
      claimOpenSlot,
      resetRelayCard
    };
  `;
  vm.runInContext(src, env.sandbox);
  return env.sandbox.__app;
}

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------- 场景一：签到认领 → 离席转交 → 全员离场断档 → 后来者补讲 → 完成 ----------
let { sandbox, localStorage } = makeEnv();
let app = loadApp({ sandbox });
let game = app.state.games.find((g) => g.name === "奥尔良");
app.createRelayCard(game);
let card = () => app.relayStore.cards[game.id];
const slot = (k) => card().slots[k];
const cat = Object.fromEntries(app.relayCategories.map((c) => [c.label, c.key]));

check("挂出后四类等待认领", app.relayCategories.every((c) => slot(c.key).status === "pending"));

app.arrivePerson(card(), "甲");
app.arrivePerson(card(), "乙");
app.arrivePerson(card(), "丙");
app.arrivePerson(card(), "丁");
check("甲认领开局准备", slot(cat["开局准备"]).assigneeId === card().people[0].id);
check("乙认领容易忘", slot(cat["容易忘的规则"]).assigneeId === card().people[1].id);
check("丙认领争议", slot(cat["常见争议"]).assigneeId === card().people[2].id);
check("丁认领计分", slot(cat["计分提醒"]).assigneeId === card().people[3].id);

// 甲讲完第一条，第二条还没讲就离席
const setupFirst = slot(cat["开局准备"]).items[0];
app.tellItem(card(), cat["开局准备"], setupFirst.id);
check("讲完条目锁定讲述人甲和时间", setupFirst.told && setupFirst.tellerName === "甲" && !!setupFirst.at);
check("讲完一类中部分条目时仍在讲解中", slot(cat["开局准备"]).status === "active");

app.leavePerson(card(), card().people[0].id);
check("甲离席后未讲条目转给乙", slot(cat["开局准备"]).assigneeId === card().people[1].id);
check("已讲条目仍记在甲名下", slot(cat["开局准备"]).items[0].tellerName === "甲");
check("乙同时持有两类", ["开局准备", "容易忘的规则"].every((l) => slot(cat[l]).assigneeId === card().people[1].id));

// 丙离席 → 争议转给丁
app.leavePerson(card(), card().people[2].id);
check("丙离席后争议转给丁", slot(cat["常见争议"]).assigneeId === card().people[3].id);

// 乙离席 → 乙名下两类的未讲内容都转给丁
app.leavePerson(card(), card().people[1].id);
check("乙离席后开局准备剩余转给丁", slot(cat["开局准备"]).assigneeId === card().people[3].id);
check("乙离席后容易忘转给丁", slot(cat["容易忘的规则"]).assigneeId === card().people[3].id);
check("甲讲过的条目没有跟着重开", slot(cat["开局准备"]).items[0].tellerName === "甲");

// 丁离席，场内无人 → 丁持有的三类剩余条目全部断档
app.leavePerson(card(), card().people[3].id);
const gapKeys = ["开局准备", "容易忘的规则", "常见争议", "计分提醒"];
check("无人承接时全部转为断档", gapKeys.every((l) => slot(cat[l]).status === "gap"));
check("断档条目打 gap 标记且未讲", gapKeys.every((l) => slot(cat[l]).items.some((i) => i.gap && !i.told)));
const gapEvents = app.historyStore.events.filter((e) => e.type === "gap");
check("断档写入历史（4 条）", gapEvents.length === 4, `实际 ${gapEvents.length}`);

// 戊到场：按顺序补讲认领第一个断档（开局准备）
app.arrivePerson(card(), "戊");
check("后来者补讲认领顺序最前的断档", slot(cat["开局准备"]).status === "active" && slot(cat["开局准备"]).assigneeId === card().people[4].id);
check("其余三类仍断档", ["容易忘的规则", "常见争议", "计分提醒"].every((l) => slot(cat[l]).status === "gap"));

// 戊把开局准备剩余讲完，再招领其余断档（戊兼讲）
app.finishSlot(card(), cat["开局准备"]);
check("补讲后开局准备已讲完", slot(cat["开局准备"]).status === "done");
app.claimOpenSlot(card(), cat["容易忘的规则"]);
app.claimOpenSlot(card(), cat["常见争议"]);
app.claimOpenSlot(card(), cat["计分提醒"]);
check("招领后三类都回到戊名下讲解中", ["容易忘的规则", "常见争议", "计分提醒"].every((l) => slot(cat[l]).status === "active"));
app.finishSlot(card(), cat["容易忘的规则"]);
app.finishSlot(card(), cat["常见争议"]);
app.finishSlot(card(), cat["计分提醒"]);
check("四类讲完后接力完成", card().completed === true);
check("历史含完成事件", app.historyStore.events.some((e) => e.type === "done"));

const allTold = app.relayCategories.every((c) => slot(c.key).items.every((i) => i.told && i.tellerName));
check("每个条目都有讲述人记录", allTold);

// ---------- 场景二：浏览器关掉再打开，进度继续 ----------
const raw = localStorage.dump();
check("卡片库独立存储", !!raw["zfl18-boardgame-rule-cards"]);
check("接力牌独立存储", !!raw["zfl18-relay-cards-v1"]);
check("历史记录独立存储", !!raw["zfl18-relay-history-v1"]);
check("接力牌数据没有混进卡片库", !raw["zfl18-boardgame-rule-cards"].includes("people"));

const env2 = makeEnv();
for (const [k, v] of Object.entries(raw)) env2.localStorage.setItem(k, v);
const app2 = loadApp({ sandbox: env2.sandbox });
const card2 = app2.relayStore.cards[game.id];
check("重开浏览器后接力仍是完成态", card2 && card2.completed === true);
check("重开浏览器后讲述人记录还在", card2.slots[cat["开局准备"]].items[0].tellerName === "甲");
check("重开浏览器后历史还在", app2.historyStore.events.filter((e) => e.gameId === game.id).length >= 10);

// ---------- 场景三：修改现有卡片不影响已挂出的接力牌；空类目自动跳过 ----------
let { sandbox: sb3, localStorage: ls3 } = makeEnv();
let app3 = loadApp({ sandbox: sb3 });
let g3 = app3.state.games.find((g) => g.name === "盖亚计划");
g3.disputes = []; // 挂出前清空争议
app3.createRelayCard(g3);
const c3 = app3.relayStore.cards[g3.id];
check("空类目自动跳过", c3.slots.disputes.status === "done" && c3.slots.disputes.skipped === true);
const snapCount = c3.slots.setup.items.length;
g3.setup.push("挂出后新加的准备，不应出现在接力牌");
check("挂出后修改复习卡片不影响快照", c3.slots.setup.items.length === snapCount && !c3.slots.setup.items.some((i) => i.text.includes("不应出现")));

app3.arrivePerson(c3, "一");
app3.arrivePerson(c3, "二");
app3.arrivePerson(c3, "三");
check("跳过空类后第3人直接认领计分(候补顺序正确)", c3.slots.scoring.assigneeId === c3.people[2].id);
for (const k of ["setup", "forgets", "scoring"]) app3.finishSlot(c3, k);
check("空类目游戏也能完成接力", c3.completed === true);

// 非法操作保护：不能替别人/离席者记讲完
const before = c3.slots.setup.items.filter((i) => i.told).length;
app3.tellItem(c3, "setup", "不存在的id");
check("讲完不存在条目被忽略", c3.slots.setup.items.filter((i) => i.told).length === before);

// ---------- 场景四：重开只清接力牌，历史保留 ----------
const histBefore = app.historyStore.events.length;
app.resetRelayCard(card());
check("重开后接力牌被移除", !app.relayStore.cards[game.id]);
check("重开后历史保留且追加 reset 事件", app.historyStore.events.length === histBefore + 1 && app.historyStore.events.at(-1).type === "reset");

// ---------- 场景五：第5位候补优先接收转交 ----------
function relayCategoriesHas(cardObj, id) {
  return ["setup", "forgets", "disputes", "scoring"].some((k) => cardObj.slots[k].assigneeId === id);
}

let { sandbox: sb5 } = makeEnv();
let app5 = loadApp({ sandbox: sb5 });
let g5 = app5.state.games.find((g) => g.name === "花砖物语");
app5.createRelayCard(g5);
const c5 = app5.relayStore.cards[g5.id];
["甲", "乙", "丙", "丁", "戊"].forEach((n) => app5.arrivePerson(c5, n));
check("戊进入候补", c5.people[4].status === "present");
check("候补者名下没有类别", !relayCategoriesHas(c5, c5.people[4].id));
app5.leavePerson(c5, c5.people[0].id); // 甲离席
check("甲的开局准备优先转给候补戊", c5.slots.setup.assigneeId === c5.people[4].id);
app5.leavePerson(c5, c5.people[1].id); // 乙离席，此时候补戊已占用
// 乙之后的在场者：丙(争议)、丁(计分)、戊(开局) 都有任务 → 回退给最靠前的丙
check("无空闲候补时回退给顺序最靠前的在场者丙", c5.slots.forgets.assigneeId === c5.people[2].id);

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
