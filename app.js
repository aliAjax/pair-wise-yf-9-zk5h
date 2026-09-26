const storageKey = "zfl18-boardgame-rule-cards";
// 接力牌与历史记录各自独立存放，不与现有卡片混在一起
const relayStorageKey = "zfl18-relay-cards";
const relayHistoryKey = "zfl18-relay-history";
const today = new Date();

// 讲解的固定认领顺序：先讲怎么摆，再讲容易忘和有争议的，最后讲怎么计分
const relayCategoryOrder = [
  { key: "setup", title: "开局准备" },
  { key: "forgets", title: "容易忘的规则" },
  { key: "disputes", title: "常见争议" },
  { key: "scoring", title: "计分提醒" }
];
const relayNumbers = ["①", "②", "③", "④"];

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

// 当前正在进行的接力牌（每款游戏至多一张），与已归档的历史分开
let relays = loadJsonStore(relayStorageKey, {});
let relayHistory = loadJsonStore(relayHistoryKey, []);
// 若游戏已被删除，它的接力牌不再继续，作为断档留进历史
pruneOrphanRelays();

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
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJsonStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveRelays() {
  saveJsonStore(relayStorageKey, relays);
}

function saveRelayHistory() {
  saveJsonStore(relayHistoryKey, relayHistory);
}

function pruneOrphanRelays() {
  const orphans = Object.values(relays).filter(
    (relay) => !state.games.some((game) => game.id === relay.gameId)
  );
  orphans.forEach((relay) => gapRelay(relay));
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
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
              ${
                relays[game.id]
                  ? `<span class="relay-ribbon ${
                      relays[game.id].categories.some((category) => category.status === "handoff")
                        ? "waiting"
                        : "live"
                    }">讲解接力中</span>`
                  : ""
              }
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
  els.detailView.innerHTML = `
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
      ${renderRelayPanel(game)}
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

function renderRelayPanel(game) {
  const relay = relays[game.id];
  if (!relay) {
    return `
      <section class="relay-panel">
        <div class="relay-head">
          <div>
            <h3>讲解接力牌</h3>
            <p class="relay-hint">到场按顺序认领：开局准备 → 容易忘 → 常见争议 → 计分提醒。</p>
          </div>
          <span class="relay-badge idle">未开讲</span>
        </div>
        <form class="relay-claim" id="relayClaimForm">
          <input id="relayNameInput" type="text" required maxlength="12" placeholder="你的名字，例：小王" />
          <button class="primary" type="submit">先到的人开讲</button>
        </form>
        ${renderRelayHistory(game.id)}
      </section>
    `;
  }

  const doneCount = relay.categories.reduce(
    (sum, category) => sum + category.items.filter((item) => item.status === "done").length,
    0
  );
  const gapCount = relay.categories.reduce(
    (sum, category) => sum + category.items.filter((item) => item.status === "gap").length,
    0
  );
  const totalCount = relay.categories.reduce((sum, category) => sum + category.items.length, 0);
  const handoff = relay.categories.some((category) => category.status === "handoff");
  const statusLabel = handoff ? "等待承接" : "讲解中";
  const statusClass = handoff ? "waiting" : "live";

  return `
    <section class="relay-panel active">
      <div class="relay-head">
        <div>
          <h3>讲解接力牌</h3>
          <p class="relay-hint">已讲 ${doneCount}/${totalCount} 条${gapCount ? ` · ${gapCount} 条断档` : ""} · ${formatRelayTime(relay.startedAt)} 开始</p>
        </div>
        <span class="relay-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="relay-categories">
        ${relay.categories.map((category) => renderRelayCategory(category)).join("")}
      </div>
      <form class="relay-claim" id="relayClaimForm">
        <input id="relayNameInput" type="text" required maxlength="12" placeholder="${handoff ? "后来的人：输入名字承接未讲部分" : "下一位到场：输入名字认领下一类"}" />
        <button class="primary" type="submit">${handoff ? "我来承接" : "认领下一类"}</button>
      </form>
      ${
        handoff
          ? `<button class="relay-gap" type="button" data-relay-action="gap">没人承接，记成断档</button>`
          : ""
      }
    </section>
  `;
}

function renderRelayCategory(category) {
  const number = relayNumbers[category.position];
  const statusText = {
    pending: "待认领",
    active: "正在讲",
    handoff: "待承接",
    done: "已讲完",
    gap: "断档"
  }[category.status];
  const holders = category.holders.length
    ? category.holders.map((name) => escapeHtml(name)).join(" → ")
    : "尚未认领";

  return `
    <div class="relay-category ${category.status}" data-relay-category="${category.key}">
      <div class="relay-category-head">
        <strong>${number} ${escapeHtml(category.title)}</strong>
        <span class="relay-status">${statusText}</span>
      </div>
      <p class="relay-holders">讲述人：${holders}</p>
      <ul class="relay-items">
        ${category.items.map((item) => renderRelayItem(category, item)).join("")}
      </ul>
      ${
        category.status === "active"
          ? `<button class="relay-finish" type="button" data-relay-action="finish">整类都讲完了</button>`
          : ""
      }
      ${
        category.status === "active" && category.items.some((item) => item.status !== "done")
          ? `<button class="relay-leave" type="button" data-relay-action="leave">临时离席，转给下一位</button>`
          : ""
      }
    </div>
  `;
}

function renderRelayItem(category, item) {
  if (category.status === "pending") {
    return `<li class="relay-item pending"><span class="relay-check">○</span><span class="relay-text">${escapeHtml(item.text)}</span></li>`;
  }
  if (item.status === "done") {
    return `
      <li class="relay-item done">
        <span class="relay-check">✓</span>
        <span class="relay-text">${escapeHtml(item.text)}</span>
        <span class="relay-teller">${escapeHtml(item.teller)}</span>
      </li>
    `;
  }
  if (item.status === "gap") {
    return `
      <li class="relay-item gap">
        <span class="relay-check">—</span>
        <span class="relay-text">${escapeHtml(item.text)}</span>
        <span class="relay-teller">断档</span>
      </li>
    `;
  }
  // 正在讲解的条目：当前讲述人勾选即代表讲完
  return `
    <li class="relay-item active">
      <label class="relay-check-label">
        <input type="checkbox" data-relay-action="toggle" data-item-id="${item.id}" />
        <span class="relay-check">○</span>
      </label>
      <span class="relay-text">${escapeHtml(item.text)}</span>
    </li>
  `;
}

function renderRelayHistory(gameId) {
  const records = relayHistory.filter((relay) => relay.gameId === gameId);
  if (!records.length) return "";
  return `
    <details class="relay-history">
      <summary>历史记录（${records.length} 局）</summary>
      ${records.map(renderRelayRecord).join("")}
    </details>
  `;
}

function renderRelayRecord(relay) {
  const outcomeClass = relay.outcome === "已讲完" ? "done" : "gap";
  return `
    <article class="relay-record ${outcomeClass}">
      <div class="relay-record-head">
        <span class="relay-record-outcome">${relay.outcome}</span>
        <time>${formatRelayTime(relay.startedAt)}${relay.endedAt ? ` ~ ${formatRelayTime(relay.endedAt)}` : ""}</time>
      </div>
      ${relay.categories
        .map((category) => {
          const holders = category.holders.length
            ? category.holders.map((name) => escapeHtml(name)).join(" → ")
            : "无人认领";
          const items = category.items
            .map((item) => {
              const marker = item.status === "done" ? "✓" : "—";
              const note = item.status === "done" ? escapeHtml(item.teller || "") : "断档";
              return `<li class="relay-record-item ${item.status}"><span class="relay-record-mark">${marker}</span><span class="relay-text">${escapeHtml(item.text)}</span><span class="relay-teller">${note}</span></li>`;
            })
            .join("");
          return `
            <div class="relay-record-category">
              <p>${relayNumbers[category.position]} ${escapeHtml(category.title)} · ${holders}</p>
              <ul>${items}</ul>
            </div>
          `;
        })
        .join("")}
    </article>
  `;
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
}

function getRelayCategories(game) {
  return relayCategoryOrder
    .map((meta, index) => ({ ...meta, position: index, items: game[meta.key] || [] }))
    .filter((category) => category.items.length > 0);
}

function startRelay(game, name) {
  const categories = getRelayCategories(game).map((category) => ({
    key: category.key,
    title: category.title,
    position: category.position,
    status: "pending",
    holders: [],
    items: category.items.map((text) => ({
      id: crypto.randomUUID(),
      text,
      status: "pending",
      teller: ""
    }))
  }));
  if (!categories.length) return false;
  const first = categories[0];
  first.status = "active";
  first.holders.push(name);
  relays[game.id] = {
    id: crypto.randomUUID(),
    gameId: game.id,
    gameName: game.name,
    startedAt: Date.now(),
    categories
  };
  saveRelays();
  return true;
}

function claimRelay(relay, name) {
  const handoff = relay.categories.find((category) => category.status === "handoff");
  const pending = handoff || relay.categories.find((category) => category.status === "pending");
  if (!pending) return;
  pending.status = "active";
  if (!pending.holders.includes(name)) pending.holders.push(name);
  saveRelays();
}

function findRelayCategory(relay, categoryKey) {
  return relay.categories.find((category) => category.key === categoryKey);
}

function toggleRelayItem(category, item, name) {
  if (item.status === "done") {
    item.status = "pending";
    item.teller = "";
  } else {
    item.status = "done";
    // 讲完的条目始终保留实际讲述人，后续离席转交也不会重开
    item.teller = name;
  }
  const allDone = category.items.every((entry) => entry.status === "done");
  if (allDone) category.status = "done";
  else if (category.status === "done") category.status = "active";
  saveRelays();
}

function finishCategory(category, name) {
  if (category.status !== "active") return;
  category.items.forEach((item) => {
    if (item.status !== "done") {
      item.status = "done";
      item.teller = name;
    }
  });
  category.status = "done";
  saveRelays();
}

function leaveRelay(category) {
  // 只把未讲内容转成待承接，已讲条目的讲述人原样保留
  if (category.status !== "active") return;
  category.status = "handoff";
  saveRelays();
}

function gapRelay(relay) {
  relay.categories.forEach((category) => {
    if (category.status === "done") return;
    category.items.forEach((item) => {
      if (item.status !== "done") item.status = "gap";
    });
    category.status = "gap";
  });
  archiveRelay(relay, "断档");
}

function maybeArchiveFinished(relay) {
  const finished = relay.categories.every((category) => category.status === "done");
  if (finished) archiveRelay(relay, "已讲完");
}

function archiveRelay(relay, outcome) {
  relay.endedAt = Date.now();
  relay.outcome = outcome;
  relayHistory.unshift(relay);
  delete relays[relay.gameId];
  saveRelays();
  saveRelayHistory();
}

function formatRelayTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  if (event.target.id === "relayClaimForm") {
    event.preventDefault();
    const game = state.games.find((item) => item.id === state.selectedId);
    if (!game) return;
    const name = document.querySelector("#relayNameInput").value.trim();
    if (!name) return;
    const relay = relays[game.id];
    if (relay) {
      claimRelay(relay, name);
    } else {
      const started = startRelay(game, name);
      if (!started) {
        alert("这款游戏还没有任何规则卡片，先在上方补充一条再开讲。");
        return;
      }
    }
    renderAll();
    return;
  }

  if (event.target.id !== "ruleForm") return;
  event.preventDefault();
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;
  const key = document.querySelector("#ruleTypeInput").value;
  const text = document.querySelector("#ruleTextInput").value.trim();
  if (!text) return;
  game[key].push(text);
  renderAll();
});

els.detailView.addEventListener("change", (event) => {
  const checkbox = event.target.closest('[data-relay-action="toggle"]');
  if (!checkbox) return;
  const game = state.games.find((item) => item.id === state.selectedId);
  const relay = game && relays[game.id];
  if (!relay) return;
  const category = relay.categories.find(
    (entry) => entry.status === "active" && entry.items.some((item) => item.id === checkbox.dataset.itemId)
  );
  const item = category?.items.find((entry) => entry.id === checkbox.dataset.itemId);
  if (!category || !item) return;
  const name = category.holders[category.holders.length - 1];
  toggleRelayItem(category, item, name);
  maybeArchiveFinished(relay);
  renderAll();
});

els.detailView.addEventListener("click", (event) => {
  const relayAction = event.target.closest("button[data-relay-action]");
  if (relayAction) {
    const game = state.games.find((item) => item.id === state.selectedId);
    const relay = game && relays[game.id];
    if (!relay) return;
    const action = relayAction.dataset.relayAction;
    const categoryNode = relayAction.closest("[data-relay-category]");
    const category = categoryNode ? findRelayCategory(relay, categoryNode.dataset.relayCategory) : null;

    if (action === "finish" && category) {
      finishCategory(category, category.holders[category.holders.length - 1]);
      maybeArchiveFinished(relay);
      renderAll();
    }

    if (action === "leave" && category) {
      leaveRelay(category);
      saveRelays();
      renderAll();
    }

    if (action === "gap") {
      gapRelay(relay);
      renderAll();
    }
    return;
  }

  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  const game = state.games.find((item) => item.id === state.selectedId);
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
    // 接力牌与历史随游戏一起清走（三者分开存放，需要各自处理）
    delete relays[game.id];
    relayHistory = relayHistory.filter((relay) => relay.gameId !== game.id);
    saveRelays();
    saveRelayHistory();
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    renderAll();
  }
});

setDefaultDate();
renderAll();
