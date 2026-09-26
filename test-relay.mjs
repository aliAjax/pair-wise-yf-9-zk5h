import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

function same(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function makeEl() {
  return {
    value: "",
    textContent: "",
    innerHTML: "",
    files: [],
    dataset: {},
    addEventListener() {},
    reset() {},
    querySelector: () => makeEl(),
    closest: () => null
  };
}

function loadApp(store) {
  const code = fs.readFileSync("/workspace/app.js", "utf8");
  const sandbox = {
    console,
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => delete store[key]
    },
    crypto: { randomUUID: () => `id-${Math.random().toString(36).slice(2, 10)}` },
    structuredClone: (value) => JSON.parse(JSON.stringify(value)),
    Date,
    alert: (msg) => console.log("alert:", msg),
    document: {
      querySelector: () => makeEl(),
      addEventListener() {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    code +
      `;
      this.__api = {
        getState: () => state,
        getRelays: () => relays,
        getHistory: () => relayHistory,
        startRelay, claimRelay, finishCategory, leaveRelay, gapRelay,
        toggleRelayItem, findRelayCategory, maybeArchiveFinished
      };`,
    sandbox
  );
  return sandbox.__api;
}

// 1. 完整讲完一局：顺序认领 + 中途离席转交
let store = {};
let api = loadApp(store);
let game = api.getState().games[0]; // 奥尔良

assert.equal(api.startRelay(game, "小王"), true);
let relay = api.getRelays()[game.id];
assert.ok(relay, "接力牌已创建");
same(
  relay.categories.map((c) => [c.position, c.status]),
  [[0, "active"], [1, "pending"], [2, "pending"], [3, "pending"]],
  "第一类开局准备由先到的小王认领，其余待认领"
);
same(relay.categories[0].holders, ["小王"]);

// 小王讲完开局准备整类
api.finishCategory(relay.categories[0], "小王"); api.maybeArchiveFinished(relay);
assert.equal(relay.categories[0].status, "done");
assert.ok(relay.categories[0].items.every((i) => i.teller === "小王"));

// 小李到场认领下一类（容易忘）
api.claimRelay(relay, "小李");
assert.equal(relay.categories[1].status, "active");
same(relay.categories[1].holders, ["小李"]);

// 小李逐条讲：勾第一条，临时离席
const forgets = relay.categories[1];
api.toggleRelayItem(forgets, forgets.items[0], "小李");
assert.equal(forgets.items[0].status, "done");
assert.equal(forgets.items[0].teller, "小李");
api.leaveRelay(forgets);
assert.equal(forgets.status, "handoff", "离席后该类转为待承接");
assert.equal(forgets.items[0].teller, "小李", "已讲记录保留原讲述人，不跟着重开");
assert.equal(forgets.items[1].status, "pending", "未讲内容留给下一位");

// 小张到场承接
api.claimRelay(relay, "小张");
assert.equal(forgets.status, "active");
same(forgets.holders, ["小李", "小张"], "同一类的讲述人按到场顺序留痕");
api.finishCategory(forgets, "小张"); api.maybeArchiveFinished(relay);
assert.equal(forgets.items[1].teller, "小张");
assert.equal(forgets.items[0].teller, "小李");

// 争议、计分依次认领讲完 -> 自动归档“已讲完”
api.claimRelay(relay, "小赵");
api.finishCategory(relay.categories[2], "小赵"); api.maybeArchiveFinished(relay);
api.claimRelay(relay, "小钱");
api.finishCategory(relay.categories[3], "小钱"); api.maybeArchiveFinished(relay);
assert.equal(api.getRelays()[game.id], undefined, "全部讲完后从进行中的接力牌移除");
assert.equal(api.getHistory().length, 1);
const record = api.getHistory()[0];
assert.equal(record.outcome, "已讲完");
same(
  record.categories.map((c) => c.holders),
  [["小王"], ["小李", "小张"], ["小赵"], ["小钱"]]
);
assert.equal(record.categories[1].items[0].teller, "小李");
assert.equal(record.categories[1].items[1].teller, "小张");

// 2. 三处独立存储
assert.ok(store["zfl18-boardgame-rule-cards"], "现有卡片存储");
assert.ok(store["zfl18-relay-cards"], "接力牌独立存储");
assert.ok(store["zfl18-relay-history"], "历史记录独立存储");
assert.equal(JSON.parse(store["zfl18-relay-cards"])[game.id], undefined, "讲完的牌不再留在进行区");

// 3. 关掉浏览器再打开：从历史看到已归档记录
api = loadApp(store);
assert.equal(api.getHistory().length, 1);
assert.equal(api.getHistory()[0].outcome, "已讲完");

// 4. 进行中断档：离席后无人承接
game = api.getState().games[1]; // 盖亚计划
assert.equal(api.startRelay(game, "小王"), true);
relay = api.getRelays()[game.id];
api.finishCategory(relay.categories[0], "小王"); api.maybeArchiveFinished(relay);
api.claimRelay(relay, "小李");
const disputes = relay.categories[1];
api.toggleRelayItem(disputes, disputes.items[0], "小李");
api.leaveRelay(disputes);
// 重新打开页面，等待承接状态仍在
store = { ...store };
api = loadApp(store);
relay = api.getRelays()[game.id];
assert.equal(relay.categories[1].status, "handoff", "刷新后仍停在待承接进度");
assert.equal(relay.categories[1].items[0].teller, "小李");

// 没人承接 -> 记成断档
api.gapRelay(relay);
assert.equal(api.getRelays()[game.id], undefined);
const gapRecord = api.getHistory().find((r) => r.gameId === game.id);
assert.equal(gapRecord.outcome, "断档");
assert.equal(gapRecord.categories[0].items.every((i) => i.status === "done"), true, "已讲完的类不动");
assert.equal(gapRecord.categories[1].items[0].status, "done", "已讲条目保留");
assert.equal(gapRecord.categories[1].items[1].status, "gap", "未讲条目记断档");
assert.equal(gapRecord.categories[2].status, "gap", "还没认领的类整类断档");
assert.equal(gapRecord.categories[3].status, "gap");

// 5. 接力进行中删掉游戏：重新加载时孤儿接力牌作为断档进历史
game = api.getState().games[2]; // 花砖物语
api.startRelay(game, "小王");
relay = api.getRelays()[game.id];
api.finishCategory(relay.categories[0], "小王"); api.maybeArchiveFinished(relay);
// 模拟用户在主卡片存储里删掉游戏（删除按钮在同一次加载中由 UI 处理器同时清两个库；
// 这里验证跨页面场景：只有卡片库少了游戏）
const main = JSON.parse(store["zfl18-boardgame-rule-cards"]);
main.games = main.games.filter((g) => g.id !== game.id);
store["zfl18-boardgame-rule-cards"] = JSON.stringify(main);
const historyBefore = JSON.parse(store["zfl18-relay-history"]).length;
api = loadApp(store);
assert.equal(api.getRelays()[game.id], undefined, "孤儿接力牌不再进行");
const orphan = api.getHistory().find((r) => r.gameId === game.id);
assert.ok(orphan, "孤儿接力牌留进历史");
assert.equal(orphan.outcome, "断档");
assert.equal(orphan.categories[0].items.every((i) => i.status === "done"), true);
assert.ok(orphan.categories.slice(1).some((c) => c.status === "gap"));
assert.equal(api.getHistory().length, historyBefore + 1);

// 6. 现有卡片在接力期间新增内容不影响已开始的接力（快照隔离）
store = {};
api = loadApp(store);
game = api.getState().games[0];
api.startRelay(game, "小王");
relay = api.getRelays()[game.id];
const snapshotCount = relay.categories.reduce((s, c) => s + c.items.length, 0);
game.setup.push("中途新加的一条准备事项");
assert.equal(
  relay.categories.reduce((s, c) => s + c.items.length, 0),
  snapshotCount,
  "接力牌快照不随后补的卡片变化"
);

// 7. 空游戏不能开讲
game = { id: "empty", name: "空壳", forgets: [], disputes: [], setup: [], scoring: [] };
assert.equal(api.startRelay(game, "小王"), false);

console.log("全部接力牌流程测试通过 ✅");
