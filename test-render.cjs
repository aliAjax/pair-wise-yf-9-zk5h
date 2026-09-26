const fs = require("fs");
const vm = require("vm");
const path = require("path");

function makeEl() {
  return {
    value: "",
    files: [],
    textContent: "",
    innerHTML: "",
    addEventListener() {},
    reset() {},
    querySelector() { return makeEl(); }
  };
}
const mem = new Map();
const sandbox = {
  document: { querySelector: () => makeEl() },
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  window: { confirm: () => true },
  console,
  structuredClone,
  crypto: require("crypto").webcrypto
};
vm.createContext(sandbox);
let src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
src += `;globalThis.__app = {
  get state() { return state; }, get relayStore() { return relayStore; }, get historyStore() { return historyStore; },
  renderRelay, createRelayCard, arrivePerson, leavePerson, tellItem, finishSlot, claimOpenSlot
};`;
vm.runInContext(src, sandbox);
const app = sandbox.__app;

let passed = 0, failed = 0;
const check = (name, cond) => { cond ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`)); };

for (const g of app.state.games) {
  const empty = app.renderRelay(g);
  check(`${g.name} 未挂出时渲染挂载按钮`, empty.includes("挂上接力牌") && !empty.includes("undefined"));
}

const g = app.state.games.find((x) => x.name === "奥尔良");
app.createRelayCard(g);
const card = () => app.relayStore.cards[g.id];
app.arrivePerson(card(), "甲");
app.arrivePerson(card(), "乙");
const active = app.renderRelay(g);
check("讲解中渲染签到表、人员、四类卡片", active.includes("到场签到") && active.includes("甲") && active.includes("讲解中") && !active.includes("undefined"));

app.tellItem(card(), "setup", card().slots.setup.items[0].id);
app.leavePerson(card(), card().people[0].id);
app.leavePerson(card(), card().people[1].id);
const gap = app.renderRelay(g);
check("断档状态渲染断档标记和招领按钮", gap.includes("断档") && gap.includes("招领补讲") && gap.includes("历史记录") && !gap.includes("undefined"));
check("已讲条目显示原讲述人甲", gap.includes(">甲 · "));

app.arrivePerson(card(), "丙");
for (const k of ["setup","forgets","disputes","scoring"]) {
  if (["gap","pending"].includes(card().slots[k].status)) app.claimOpenSlot(card(), k);
  app.finishSlot(card(), k);
}
const done = app.renderRelay(g);
check("完成状态显示结束横幅", done.includes("四类提醒已全部讲完") && card().completed);
check("完成态无 undefined/null 泄漏", !done.includes("undefined") && !done.includes(">null<"));

// 空类目渲染
const g2 = app.state.games.find((x) => x.name === "盖亚计划");
g2.disputes = [];
app.createRelayCard(g2);
app.arrivePerson(app.relayStore.cards[g2.id], "独讲者");
const c2 = app.relayStore.cards[g2.id];
for (const k of ["setup","forgets","scoring"]) { if (c2.slots[k].status === "pending") app.claimOpenSlot(c2, k); app.finishSlot(c2, k); }
const html2 = app.renderRelay(g2);
check("空类目渲染跳过提示且可完成", html2.includes("自动跳过") && c2.completed && !html2.includes("undefined"));

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
