const storageKey = "zfl18-boardgame-rule-cards";
const relayStorageKey = "zfl18-relay-cards-v1";
const historyStorageKey = "zfl18-relay-history-v1";
const today = new Date();

// 接力讲解的固定认领顺序：先讲开局，最后讲计分
const relayCategories = [
  { key: "setup", label: "开局准备" },
  { key: "forgets", label: "容易忘的规则" },
  { key: "disputes", label: "常见争议" },
  { key: "scoring", label: "计分提醒" }
];

const defaultState = {
  selectedId: "",
  games: [
    {
      id: crypto.randomUUID(),
      name: "奥尔良",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 90,
      complexity: "中",
      lastPlayed: "2025-11-20",
      cover: "",
      forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
      disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
      setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
      scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
    },
    {
      id: crypto.randomUUID(),
      name: "盖亚计划",
      minPlayers: 1,
      maxPlayers: 4,
      duration: 150,
      complexity: "重",
      lastPlayed: "2025-08-02",
      cover: "",
      forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
      disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
      setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
      scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
    },
    {
      id: crypto.randomUUID(),
      name: "花砖物语",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 45,
      complexity: "轻",
      lastPlayed: "2026-03-15",
      cover: "",
      forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
      disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
      setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
      scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
    }
  ]
};

let state = loadState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

// 接力牌与历史记录各自独立存放，互不混入卡片库
let relayStore = loadRelayStore();
let historyStore = loadHistoryStore();

const els = {
  searchInput: document.querySelector("#searchInput"),
  playerFilter: document.querySelector("#playerFilter"),
  complexityFilter: document.querySelector("#complexityFilter"),
  sortMode: document.querySelector("#sortMode"),
  gameForm: document.querySelector("#gameForm"),
  nameInput: document.querySelector("#nameInput"),
  minPlayersInput: document.querySelector("#minPlayersInput"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  durationInput: document.querySelector("#durationInput"),
  complexityInput: document.querySelector("#complexityInput"),
  lastPlayedInput: document.querySelector("#lastPlayedInput"),
  coverInput: document.querySelector("#coverInput"),
  gameList: document.querySelector("#gameList"),
  detailView: document.querySelector("#detailView"),
  gameCount: document.querySelector("#gameCount"),
  ruleCount: document.querySelector("#ruleCount"),
  staleGame: document.querySelector("#staleGame"),
  visibleCount: document.querySelector("#visibleCount")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadJsonStore(key, fallback) {
  const saved = localStorage.getItem(key);
  if (!saved) return structuredClone(fallback);
  try {
    return { ...structuredClone(fallback), ...JSON.parse(saved) };
  } catch {
    return structuredClone(fallback);
  }
}

function loadRelayStore() {
  const store = loadJsonStore(relayStorageKey, { ui: { tab: "cards" }, cards: {} });
  store.cards = store.cards || {};
  store.ui = store.ui || { tab: "cards" };
  return store;
}

function loadHistoryStore() {
  const store = loadJsonStore(historyStorageKey, { events: [] });
  store.events = Array.isArray(store.events) ? store.events : [];
  return store;
}

function saveRelayStore() {
  localStorage.setItem(relayStorageKey, JSON.stringify(relayStore));
}

function saveHistoryStore() {
  localStorage.setItem(historyStorageKey, JSON.stringify(historyStore));
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 历史只追加，不改写：断档、转交等记录都会一直保留
function addHistory(gameId, gameName, type, detail) {
  historyStore.events.push({
    id: crypto.randomUUID(),
    at: nowIso(),
    gameId,
    gameName,
    type,
    detail
  });
  saveHistoryStore();
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getAllRules(game) {
  return [...game.forgets, ...game.disputes, ...game.setup, ...game.scoring];
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = `${game.name}${getAllRules(game).join("")}`;
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer = player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name") return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  const allRuleCount = state.games.reduce((sum, game) => sum + getAllRules(game).length, 0);
  const stale = [...state.games].sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed))[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selected = game.id === state.selectedId ? "selected" : "";
        const activeRelay = relayStore.cards[game.id] && !relayStore.cards[game.id].completed;
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
              ${activeRelay ? `<span class="relay-ribbon">接力进行中</span>` : ""}
            </div>
            <div class="game-body">
              <h3>${escapeHtml(game.name)}</h3>
              <div class="game-meta">
                <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
                <span class="pill">${game.duration}分钟</span>
                <span class="pill heavy">${escapeHtml(game.complexity)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的桌游。</p>`;
}

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
  const tab = relayStore.ui.tab === "relay" ? "relay" : "cards";
  els.detailView.innerHTML = `
    <div class="detail-tabs" role="tablist">
      <button type="button" class="detail-tab ${tab === "cards" ? "active" : ""}" data-tab="cards">复习卡片</button>
      <button type="button" class="detail-tab ${tab === "relay" ? "active" : ""}" data-tab="relay">讲解接力</button>
    </div>
    ${tab === "cards" ? renderQuickCard(game) : `<div class="relay-wrap">${renderRelay(game)}</div>`}
  `;
}

function renderQuickCard(game) {
  return `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
        </div>
      </div>
      ${renderRuleSection("容易忘的规则", "forgets", game.forgets)}
      ${renderRuleSection("常见争议", "disputes", game.disputes)}
      ${renderRuleSection("开局准备", "setup", game.setup)}
      ${renderRuleSection("计分提醒", "scoring", game.scoring)}
      <form class="add-rule" id="ruleForm">
        <select id="ruleTypeInput">
          <option value="forgets">容易忘的规则</option>
          <option value="disputes">常见争议</option>
          <option value="setup">开局准备</option>
          <option value="scoring">计分提醒</option>
        </select>
        <textarea id="ruleTextInput" rows="3" placeholder="补充一条聚会前要看的提醒" required></textarea>
        <button class="primary" type="submit">加入规则卡片</button>
      </form>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderRuleSection(title, key, items) {
  return `
    <section class="rule-section">
      <h3>${title}</h3>
      <ul class="rule-list">
        ${
          items
            .map(
              (item, index) => `
                <li>
                  <span>${escapeHtml(item)}</span>
                  <button type="button" title="删除" data-rule-key="${key}" data-rule-index="${index}">×</button>
                </li>
              `
            )
            .join("") || `<li><span>暂无内容。</span></li>`
        }
      </ul>
    </section>
  `;
}

/* ---------------- 讲解接力牌 ---------------- */

function createRelayCard(game) {
  const slots = {};
  for (const category of relayCategories) {
    const items = (game[category.key] || []).map((text) => ({
      id: crypto.randomUUID(),
      text,
      told: false,
      gap: false,
      tellerId: "",
      tellerName: "",
      at: ""
    }));
    slots[category.key] = items.length
      ? { assigneeId: null, status: "pending", skipped: false, items }
      : { assigneeId: null, status: "done", skipped: true, items };
  }
  relayStore.cards[game.id] = {
    gameId: game.id,
    gameName: game.name,
    createdAt: nowIso(),
    completed: false,
    people: [],
    slots
  };
  saveRelayStore();
  addHistory(game.id, game.name, "started", "接力牌已挂出，按到场顺序认领四类提醒");
  checkRelayComplete(relayStore.cards[game.id]);
}

// 到场者按顺序认领：顺序最靠前的待认领/断档一类归他
function claimNextSlot(card, person) {
  for (const category of relayCategories) {
    const slot = card.slots[category.key];
    if (slot.status !== "pending" && slot.status !== "gap") continue;
    const wasGap = slot.status === "gap";
    slot.assigneeId = person.id;
    slot.status = "active";
    addHistory(
      card.gameId,
      card.gameName,
      "arrive",
      wasGap
        ? `${person.name} 第${person.order}位到场，补讲认领「${category.label}」`
        : `${person.name} 第${person.order}位到场，认领「${category.label}」`
    );
    return category.label;
  }
  addHistory(card.gameId, card.gameName, "arrive", `${person.name} 第${person.order}位到场，四类已认领完，进入候补`);
  return "";
}

function arrivePerson(card, name) {
  const person = {
    id: crypto.randomUUID(),
    name,
    order: card.people.length + 1,
    at: nowIso(),
    status: "present"
  };
  card.people.push(person);
  claimNextSlot(card, person);
  saveRelayStore();
  checkRelayComplete(card);
}

function getPerson(card, personId) {
  return card.people.find((person) => person.id === personId);
}

function getPresentAfter(card, personId) {
  const index = card.people.findIndex((person) => person.id === personId);
  const after = card.people.slice(index + 1).filter((person) => person.status === "present");
  const free = after.find(
    (person) =>
      !relayCategories.some((category) => {
        const other = card.slots[category.key];
        return other.assigneeId === person.id && other.status === "active";
      })
  );
  return free || after[0];
}

// 临时离席：只转交未讲内容，已讲条目不动；没有下一位在场则断档
function leavePerson(card, personId) {
  const person = getPerson(card, personId);
  if (!person || person.status === "left") return;
  person.status = "left";
  addHistory(card.gameId, card.gameName, "leave", `${person.name} 临时离席`);

  for (const category of relayCategories) {
    const slot = card.slots[category.key];
    if (slot.assigneeId !== person.id) continue;
    const remaining = slot.items.filter((item) => !item.told);
    if (remaining.length === 0) {
      if (slot.status !== "done") {
        slot.status = "done";
        addHistory(card.gameId, card.gameName, "slot-done", `「${category.label}」已全部讲完（${person.name}）`);
      }
      continue;
    }
    const next = getPresentAfter(card, person.id);
    if (next) {
      slot.assigneeId = next.id;
      slot.status = "active";
      addHistory(
        card.gameId,
        card.gameName,
        "handoff",
        `${person.name} 离席，「${category.label}」剩余 ${remaining.length} 条转给下一位 ${next.name}；已讲条目仍记在 ${person.name} 名下`
      );
    } else {
      remaining.forEach((item) => {
        item.gap = true;
      });
      slot.assigneeId = null;
      slot.status = "gap";
      addHistory(
        card.gameId,
        card.gameName,
        "gap",
        `${person.name} 离席后无人承接，「${category.label}」剩余 ${remaining.length} 条记为断档`
      );
    }
  }
  saveRelayStore();
  checkRelayComplete(card);
}

function tellItem(card, slotKey, itemId) {
  const slot = card.slots[slotKey];
  const category = relayCategories.find((item) => item.key === slotKey);
  const person = getPerson(card, slot.assigneeId);
  if (!slot || slot.status !== "active" || !person || person.status !== "present") return;
  const item = slot.items.find((entry) => entry.id === itemId);
  if (!item || item.told) return;
  item.told = true;
  item.tellerId = person.id;
  item.tellerName = person.name;
  item.at = nowIso();
  addHistory(card.gameId, card.gameName, "told", `${person.name} 讲完「${category.label}」：${item.text}`);
  if (slot.items.every((entry) => entry.told)) {
    slot.status = "done";
    addHistory(card.gameId, card.gameName, "slot-done", `「${category.label}」全部讲完`);
  }
  saveRelayStore();
  checkRelayComplete(card);
}

function finishSlot(card, slotKey) {
  const slot = card.slots[slotKey];
  const category = relayCategories.find((item) => item.key === slotKey);
  const person = getPerson(card, slot.assigneeId);
  if (!slot || slot.status !== "active" || !person || person.status !== "present") return;
  const remaining = slot.items.filter((item) => !item.told);
  const at = nowIso();
  remaining.forEach((item) => {
    item.told = true;
    item.tellerId = person.id;
    item.tellerName = person.name;
    item.at = at;
  });
  slot.status = "done";
  addHistory(
    card.gameId,
    card.gameName,
    "slot-done",
    `「${category.label}」全部讲完，最后 ${remaining.length} 条由 ${person.name} 一次记完`
  );
  saveRelayStore();
  checkRelayComplete(card);
}

// 招领未开场的一类：优先给没有认领任务的在场者，否则给第一位在场者
function claimOpenSlot(card, slotKey) {
  const slot = card.slots[slotKey];
  const category = relayCategories.find((item) => item.key === slotKey);
  if (!slot || (slot.status !== "gap" && slot.status !== "pending")) return;
  const present = card.people.filter((person) => person.status === "present");
  const ownsActive = (person) =>
    relayCategories.some((entry) => {
      const other = card.slots[entry.key];
      return other.assigneeId === person.id && other.status === "active";
    });
  const person = present.find((candidate) => !ownsActive(candidate)) || present[0];
  if (!person) return;
  const wasGap = slot.items.some((item) => item.gap);
  slot.assigneeId = person.id;
  slot.status = "active";
  addHistory(
    card.gameId,
    card.gameName,
    "resume",
    wasGap
      ? `${person.name} 承接断档，补讲「${category.label}」`
      : `${person.name} 认领「${category.label}」`
  );
  saveRelayStore();
  checkRelayComplete(card);
}

function checkRelayComplete(card) {
  const countable = relayCategories.filter((category) => !card.slots[category.key].skipped);
  if (card.people.length > 0 && !card.completed && countable.every((category) => card.slots[category.key].status === "done")) {
    card.completed = true;
    addHistory(card.gameId, card.gameName, "done", "四类提醒全部讲完，本场接力结束");
    saveRelayStore();
  }
}

function resetRelayCard(card) {
  addHistory(card.gameId, card.gameName, "reset", "接力牌重开，历史记录保留");
  delete relayStore.cards[card.gameId];
  saveRelayStore();
}

function slotLabelsForPerson(card, personId) {
  return relayCategories
    .filter((category) => card.slots[category.key].assigneeId === personId)
    .map((category) => category.label);
}

function renderRelay(game) {
  const card = relayStore.cards[game.id];
  if (!card) {
    const counts = relayCategories.map((category) => ({
      ...category,
      count: (game[category.key] || []).length
    }));
    return `
      <section class="relay-board relay-empty">
        <h2>讲解接力牌</h2>
        <p class="relay-note">挂出后快照当前四类提醒，到场者按固定顺序认领；正在讲的人离席时，未讲内容转给下一位，已讲条目保留原讲述人。</p>
        <ol class="relay-order">
          ${counts
            .map((category, index) => `<li><span class="order-no">${index + 1}</span>${category.label}<em>${category.count} 条</em></li>`)
            .join("")}
        </ol>
        <button type="button" class="primary" data-action="create-card">挂上接力牌</button>
      </section>
    `;
  }

  const doneCount = relayCategories.filter((category) => card.slots[category.key].status === "done").length;
  const totalCount = relayCategories.filter((category) => !card.slots[category.key].skipped).length;
  const hasPresentBackup = card.people.some(
    (person) => person.status === "present" && !slotLabelsForPerson(card, person.id).length
  );

  return `
    <section class="relay-board">
      <div class="relay-head">
        <h2>讲解接力牌</h2>
        <span class="relay-progress">${doneCount}/${totalCount} 类讲完</span>
      </div>
      ${card.completed ? `<p class="relay-banner">四类提醒已全部讲完，可开始本局。</p>` : ""}
      <p class="relay-note">接力牌快照于挂出时，之后修改复习卡片不影响本场进度。</p>

      <form class="arrive-form" id="arriveForm">
        <input id="arriveName" type="text" maxlength="12" placeholder="到场者姓名，按签到顺序认领" required />
        <button class="primary" type="submit">到场签到</button>
      </form>

      <ol class="people-list">
        ${
          card.people
            .map(
              (person) => `
                <li class="${person.status === "left" ? "left" : ""}">
                  <span class="people-no">#${person.order}</span>
                  <span class="people-name">${escapeHtml(person.name)}</span>
                  <span class="people-tags">
                    ${slotLabelsForPerson(card, person.id).map((label) => `<em class="slot-tag">${label}</em>`).join("")}
                    ${person.status === "left" ? `<em class="left-tag">已离席</em>` : `<em class="present-tag">在场</em>`}
                  </span>
                  ${
                    person.status === "present"
                      ? `<button type="button" class="tiny" data-action="leave" data-person="${person.id}">临时离席</button>`
                      : ""
                  }
                </li>
              `
            )
            .join("") || `<li class="people-empty">还没有人到场，第一位签到者认领「开局准备」。</li>`
        }
      </ol>

      <div class="slot-list">
        ${relayCategories.map((category) => renderRelaySlot(category, card, hasPresentBackup)).join("")}
      </div>

      <div class="relay-footer">
        <button type="button" class="tiny danger" data-action="reset-card">重开这张接力牌</button>
      </div>
    </section>
    ${renderHistory(game)}
  `;
}

function renderRelaySlot(category, card, hasPresentBackup) {
  const slot = card.slots[category.key];
  const assignee = getPerson(card, slot.assigneeId);
  const statusText = {
    pending: "等待认领",
    active: "讲解中",
    done: slot.skipped ? "本类无提醒，自动跳过" : "已讲完",
    gap: "断档"
  }[slot.status];

  const headerActions = (() => {
    if (slot.status === "active" && assignee && assignee.status === "present") {
      const remaining = slot.items.filter((item) => !item.told).length;
      return `<button type="button" class="tiny" data-action="finish-slot" data-slot="${category.key}" ${remaining ? "" : "disabled"}>这类全部讲完</button>`;
    }
    if (slot.status === "gap" || slot.status === "pending") {
      const present = card.people.some((person) => person.status === "present");
      const label = slot.status === "gap" ? "招领补讲" : "认领这类";
      return `<button type="button" class="tiny ${slot.status === "gap" ? "warn" : ""}" data-action="claim-open" data-slot="${category.key}" ${present ? "" : "disabled"}>${label}${present && !hasPresentBackup ? "（兼讲）" : ""}</button>`;
    }
    return "";
  })();

  return `
    <section class="slot-card st-${slot.status}">
      <header class="slot-head">
        <div>
          <h3>${category.label}</h3>
          <span class="slot-status">${statusText}${assignee ? ` · ${escapeHtml(assignee.name)}` : ""}</span>
        </div>
        ${headerActions}
      </header>
      <ul class="relay-items">
        ${
          slot.items
            .map((item) => {
              if (item.told) {
                return `
                  <li class="relay-item told">
                    <span class="item-check" title="已讲完">✓</span>
                    <span class="item-text">${escapeHtml(item.text)}</span>
                    <span class="item-meta">${escapeHtml(item.tellerName)} · ${formatTime(item.at)}</span>
                  </li>
                `;
              }
              const canTell = slot.status === "active" && assignee && assignee.status === "present";
              return `
                <li class="relay-item ${item.gap ? "gapped" : ""}">
                  <span class="item-check pending"></span>
                  <span class="item-text">${escapeHtml(item.text)}</span>
                  <span class="item-meta">
                    ${item.gap ? `<em class="gap-tag">断档</em>` : ""}
                    ${
                      canTell
                        ? `<button type="button" class="tiny" data-action="tell-item" data-slot="${category.key}" data-item="${item.id}">讲完（记给 ${escapeHtml(assignee.name)}）</button>`
                        : slot.status === "gap"
                          ? "等待补讲"
                          : "未讲"
                    }
                  </span>
                </li>
              `;
            })
            .join("") || `<li class="relay-item"><span class="item-text">本类暂无提醒。</span></li>`
        }
      </ul>
    </section>
  `;
}

function renderHistory(game) {
  const events = historyStore.events
    .filter((event) => event.gameId === game.id)
    .reverse()
    .slice(0, 30);
  return `
    <section class="history-panel">
      <h2>历史记录</h2>
      <ul class="history-list">
        ${
          events
            .map(
              (event) => `
                <li class="history-item history-${event.type}">
                  <span class="history-dot"></span>
                  <div>
                    <p>${escapeHtml(event.detail)}</p>
                    <time>${formatTime(event.at)}</time>
                  </div>
                </li>
              `
            )
            .join("") || `<li class="empty">本场还没有历史记录。</li>`
        }
      </ul>
    </section>
  `;
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addGame(event) {
  event.preventDefault();
  const minPlayers = Number(els.minPlayersInput.value);
  const maxPlayers = Math.max(minPlayers, Number(els.maxPlayersInput.value));
  const cover = await readFileAsDataUrl(els.coverInput.files[0]);
  const game = {
    id: crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    minPlayers,
    maxPlayers,
    duration: Number(els.durationInput.value),
    complexity: els.complexityInput.value,
    lastPlayed: els.lastPlayedInput.value,
    cover,
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  state.games.unshift(game);
  state.selectedId = game.id;
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  state.selectedId = card.dataset.gameId;
  renderAll();
});

els.detailView.addEventListener("submit", (event) => {
  if (event.target.id === "ruleForm") {
    event.preventDefault();
    const game = state.games.find((item) => item.id === state.selectedId);
    if (!game) return;
    const key = document.querySelector("#ruleTypeInput").value;
    const text = document.querySelector("#ruleTextInput").value.trim();
    if (!text) return;
    game[key].push(text);
    renderAll();
    return;
  }

  if (event.target.id === "arriveForm") {
    event.preventDefault();
    const input = document.querySelector("#arriveName");
    const name = input.value.trim();
    const card = relayStore.cards[state.selectedId];
    if (!card || !name) return;
    arrivePerson(card, name);
    renderAll();
  }
});

els.detailView.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    relayStore.ui.tab = tabButton.dataset.tab;
    saveRelayStore();
    renderDetail();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  const game = state.games.find((item) => item.id === state.selectedId);
  if (actionButton && game) {
    const action = actionButton.dataset.action;
    let card = relayStore.cards[game.id];
    if (action === "create-card") {
      createRelayCard(game);
      renderAll();
      return;
    }
    if (!card) return;
    if (action === "leave") {
      leavePerson(card, actionButton.dataset.person);
      renderAll();
      return;
    }
    if (action === "tell-item") {
      tellItem(card, actionButton.dataset.slot, actionButton.dataset.item);
      renderAll();
      return;
    }
    if (action === "finish-slot") {
      finishSlot(card, actionButton.dataset.slot);
      renderAll();
      return;
    }
    if (action === "claim-gap" || action === "claim-open") {
      claimOpenSlot(card, actionButton.dataset.slot);
      renderAll();
      return;
    }
    if (action === "reset-card") {
      if (window.confirm("重开接力牌会清空本场认领和讲完进度，但历史记录保留。确定重开？")) {
        resetRelayCard(card);
        renderAll();
      }
      return;
    }
  }

  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  if (!game) return;

  if (ruleButton) {
    const key = ruleButton.dataset.ruleKey;
    const index = Number(ruleButton.dataset.ruleIndex);
    game[key].splice(index, 1);
    renderAll();
  }

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  if (deleteButton) {
    state.games = state.games.filter((item) => item.id !== game.id);
    // 接力牌随收藏一起删除；历史记录只追加，继续保留
    delete relayStore.cards[game.id];
    saveRelayStore();
    state.selectedId = state.games[0]?.id || "";
    renderAll();
  }
});

setDefaultDate();
renderAll();
