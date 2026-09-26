import vm from "node:vm";
import fs from "node:fs";

// 最小 DOM 桩：用真实 app.js 的事件监听/委托/渲染路径做一次端到端冒烟
class El {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.dataset = {};
    this.listeners = {};
    this.value = "";
    this.files = [];
    this._html = "";
  }
  setAttribute(name, value) {
    if (name.startsWith("data-")) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  dispatch(type, event = {}) {
    event.target = event.target || this;
    event.preventDefault = event.preventDefault || (() => {});
    (this.listeners[type] || []).forEach((fn) => fn(event));
  }
  set innerHTML(html) {
    this._html = html;
  }
  get innerHTML() {
    return this._html;
  }
}

// 从渲染出的 HTML 里取出 data-relay-action 按钮及其所属的 data-relay-category
function findAction(html, action) {
  const marker = `data-relay-action="${action}"`;
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const before = html.slice(0, idx);
  const catMatch = [...before.matchAll(/data-relay-category="([^"]+)"/g)].pop();
  return { category: catMatch ? catMatch[1] : null };
}

function findCheckbox(html) {
  const m = html.match(/<input[^>]*data-relay-action="toggle"[^>]*data-item-id="([^"]+)"/);
  return m ? m[1] : null;
}

function run() {
  const store = {};
  const byId = {};
  ["searchInput", "playerFilter", "complexityFilter", "sortMode", "gameForm", "nameInput",
   "minPlayersInput", "maxPlayersInput", "durationInput", "complexityInput", "lastPlayedInput",
   "coverInput", "gameList", "detailView", "gameCount", "ruleCount", "staleGame", "visibleCount"
  ].forEach((id) => (byId[id] = new El("input", id)));
  byId.playerFilter.value = "all";
  byId.complexityFilter.value = "all";
  byId.sortMode.value = "stale";

  // 让 document.querySelector 能拿到重绘后动态生成的表单控件
  function docQuery(selector) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      if (byId[id]) return byId[id];
      const m = byId.detailView.innerHTML.match(
        new RegExp(`<(?:input|select|textarea)[^>]*id="${id}"[^>]*>`)
      );
      if (m) {
        const el = new El("input", id);
        el.value = dynamicValues[id] || "";
        return el;
      }
      return null;
    }
    return null;
  }
  const dynamicValues = {};

  const shared = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => delete store[k]
    }
  };

  function boot() {
    // 关掉浏览器再开 = 全新上下文，但 localStorage 与 DOM 桩保留，事件监听重新绑定
    const sandbox = {
      console,
      localStorage: shared.localStorage,
      crypto: { randomUUID: () => `id-${Math.random().toString(36).slice(2, 9)}` },
      structuredClone: (v) => JSON.parse(JSON.stringify(v)),
      Date,
      alert: (msg) => { throw new Error(`意外弹窗: ${msg}`); },
      document: { querySelector: docQuery }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync("/workspace/app.js", "utf8"), sandbox);
  }
  boot();

  const detail = byId.detailView;
  const gameList = byId.gameList;

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  // 未开讲：开讲入口
  assert(detail.innerHTML.includes("先到的人开讲"), "缺少开讲入口");

  // 小王开讲（真实 submit 监听）
  dynamicValues.relayNameInput = "小王";
  detail.dispatch("submit", { target: { id: "relayClaimForm" } });
  assert(detail.innerHTML.includes("讲解中"), "开讲后应显示讲解中");
  assert(detail.innerHTML.includes("临时离席，转给下一位"), "活动类应有离席按钮");
  assert(gameList.innerHTML.includes("讲解接力中"), "列表应有接力角标");

  // 逐条勾选第一条（真实 change 委托）
  const itemId = findCheckbox(detail.innerHTML);
  assert(itemId, "应渲染可勾选条目");
  const checkbox = new El("input");
  checkbox.setAttribute("data-relay-action", "toggle");
  checkbox.dataset.itemId = itemId;
  checkbox.closest = (selector) =>
    selector === '[data-relay-action="toggle"]' ? checkbox : null;
  detail.dispatch("change", { target: checkbox });
  assert(detail.innerHTML.includes(">小王<"), "讲完条目应显示讲述人小王");

  // 离席（真实 click 委托）
  const leave = findAction(detail.innerHTML, "leave");
  assert(leave, "应有离席按钮");
  clickAction("leave", leave.category);
  assert(detail.innerHTML.includes("等待承接"), "离席后应等待承接");
  assert(detail.innerHTML.includes("没人承接，记成断档"), "应出现断档入口");
  assert(detail.innerHTML.includes(">小王<"), "已讲记录不能丢");

  // 关掉浏览器再打开：进度仍停在待承接
  boot();
  assert(detail.innerHTML.includes("等待承接"), "刷新后接力进度丢失");
  assert(detail.innerHTML.includes(">小王<"), "刷新后已讲讲述人丢失");

  // 小张承接
  dynamicValues.relayNameInput = "小张";
  detail.dispatch("submit", { target: { id: "relayClaimForm" } });
  assert(detail.innerHTML.includes("小王 → 小张"), "讲述人链应为 小王 → 小张");

  // 依次：讲完当前类 → 新人认领下一类，直到四类全部完成
  const newcomers = ["小李", "小赵", "小钱"];
  for (let i = 0; i < 6; i++) {
    const finish = findAction(detail.innerHTML, "finish");
    if (!finish) break;
    clickAction("finish", finish.category);
    if (detail.innerHTML.includes("认领下一类")) {
      dynamicValues.relayNameInput = newcomers[i] || "路人";
      detail.dispatch("submit", { target: { id: "relayClaimForm" } });
    }
  }
  assert(!detail.innerHTML.includes("讲解中") && !detail.innerHTML.includes("等待承接"),
    "全部讲完后应归档回未开讲态");
  assert(detail.innerHTML.includes("历史记录（1 局）"), "应出现 1 条历史");
  assert(detail.innerHTML.includes("已讲完"), "历史结果应为已讲完");
  assert(detail.innerHTML.includes("小王 → 小张"), "历史应保留讲述人链");
  // 独立存储
  assert(store["zfl18-relay-cards"] && store["zfl18-relay-history"], "接力牌与历史应独立存储");
  assert(!JSON.parse(store["zfl18-relay-cards"]).length ||
    Object.keys(JSON.parse(store["zfl18-relay-cards"])).length === 0,
    "讲完后进行区应为空");

  console.log("真实事件绑定冒烟测试通过 ✅");

  function clickAction(action, category) {
    const btn = new El("button");
    btn.setAttribute("data-relay-action", action);
    btn.closest = (selector) => {
      if (selector === `button[data-relay-action]`) return btn;
      if (selector === `[data-relay-action]`) return btn;
      if (selector === "[data-relay-category]" && category) {
        const cat = new El("div");
        cat.setAttribute("data-relay-category", category);
        return cat;
      }
      return null;
    };
    detail.dispatch("click", { target: btn });
  }
}

run();
