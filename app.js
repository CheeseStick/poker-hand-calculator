'use strict';

// UI state + rendering for the game-play calculator.
// State persists to localStorage so an accidental refresh at the table
// doesn't lose the hand in progress.

const STRINGS = {
  ko: {
    title: '포커 핸드 계산기',
    reset: '지우기',
    holeTitle: '내 카드',
    boardTitle: '보드',
    opponents: '상대 수',
    pickHole: '내 카드 2장을 선택하세요',
    pickBoard: (n) => `보드 카드를 선택하세요 (${n}/5)`,
    currentHand: '현재 핸드',
    winChance: (n) => `예상 승률 (상대 ${n}명)`,
    langButton: 'EN',
    hands: {
      1: '하이 카드', 2: '원 페어', 3: '투 페어', 4: '트리플', 5: '스트레이트',
      6: '플러시', 7: '풀 하우스', 8: '포카드', 9: '스트레이트 플러시', 10: '로열 플러시',
    },
  },
  en: {
    title: 'Poker Hand Calculator',
    reset: 'Clear',
    holeTitle: 'Your cards',
    boardTitle: 'Board',
    opponents: 'Opponents',
    pickHole: 'Pick your two hole cards',
    pickBoard: (n) => `Pick the board as it's revealed (${n}/5)`,
    currentHand: 'Current hand',
    winChance: (n) => `Win chance (vs ${n})`,
    langButton: '한국어',
    hands: {
      1: 'High Card', 2: 'One Pair', 3: 'Two Pair', 4: 'Three of a Kind', 5: 'Straight',
      6: 'Flush', 7: 'Full House', 8: 'Four of a Kind', 9: 'Straight Flush', 10: 'Royal Flush',
    },
  },
};

const SUIT_INFO = {
  s: { symbol: '♠', red: false },
  h: { symbol: '♥', red: true },
  d: { symbol: '♦', red: true },
  c: { symbol: '♣', red: false },
};

const HOLE_COUNT = 2;
const MAX_CARDS = 7;
const STORAGE_KEY = 'poker-hand-web.state';

const state = {
  selected: [],       // first two are hole cards, the rest is the board
  opponents: 1,
  suit: 's',
  lang: navigator.language.startsWith('ko') ? 'ko' : 'en',
};

// ---- Persistence ----

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return;
    if (Array.isArray(stored.selected)) state.selected = stored.selected.slice(0, MAX_CARDS);
    if ([1, 2, 3, 4].includes(stored.opponents)) state.opponents = stored.opponents;
    if (SUIT_INFO[stored.suit]) state.suit = stored.suit;
    if (STRINGS[stored.lang]) state.lang = stored.lang;
  } catch { /* fresh start on malformed storage */ }
}

// ---- Derived state ----

const t = () => STRINGS[state.lang];
const holeCards = () => state.selected.slice(0, HOLE_COUNT);
const boardCards = () => state.selected.slice(HOLE_COUNT);
const isSelected = (card) => state.selected.some((c) => Poker.sameCard(c, card));

// { name, coreIds } of the best made hand so far, or null before two cards.
function currentBest() {
  const cards = state.selected;
  if (cards.length < 2) return null;
  if (cards.length >= 5) {
    const hand = Poker.bestHand(cards);
    return { cat: hand.cat, coreIds: new Set(Poker.coreCards(hand).map(Poker.cardId)) };
  }
  const partial = Poker.partialHand(cards);
  return { cat: partial.cat, coreIds: new Set(partial.core.map(Poker.cardId)) };
}

// ---- Actions ----

function toggleCard(card) {
  const index = state.selected.findIndex((c) => Poker.sameCard(c, card));
  if (index >= 0) state.selected.splice(index, 1);
  else if (state.selected.length < MAX_CARDS) state.selected.push(card);
  else return;
  saveState();
  render();
}

// ---- Rendering ----

function cardHTML(card, { dim = false, selected = false } = {}) {
  const suit = SUIT_INFO[card.s];
  const rank = card.r === 14 ? 'A' : card.r === 13 ? 'K' : card.r === 12 ? 'Q' : card.r === 11 ? 'J' : card.r;
  const classes = ['card', suit.red ? 'red' : 'black'];
  if (dim) classes.push('dim');
  if (selected) classes.push('selected');
  return `<div class="${classes.join(' ')}" data-card="${Poker.cardId(card)}">
    <span class="corner">${rank}<span>${suit.symbol}</span></span>
    <span class="big">${suit.symbol}</span>
  </div>`;
}

function renderZones() {
  const best = currentBest();
  const zone = (cards, capacity) => {
    const placed = cards.map((card) => cardHTML(card, {
      dim: best !== null && !best.coreIds.has(Poker.cardId(card)),
    })).join('');
    const slots = '<div class="card slot"></div>'.repeat(capacity - cards.length);
    return placed + slots;
  };
  document.getElementById('hole-row').innerHTML = zone(holeCards(), HOLE_COUNT);
  document.getElementById('board-row').innerHTML = zone(boardCards(), 5);
}

function renderStatus() {
  const target = document.getElementById('status');
  if (holeCards().length < HOLE_COUNT) {
    target.innerHTML = `<div class="prompt">${t().pickHole}</div>`;
    return;
  }

  const best = currentBest();
  const winPercent = Math.round(Poker.equity(holeCards(), boardCards(), state.opponents) * 100);
  const boardPrompt = boardCards().length < 5
    ? `<div class="prompt">${t().pickBoard(boardCards().length)}</div>` : '';
  target.innerHTML = `
    <div class="stats">
      <div><div class="stat-title">${t().currentHand}</div>
           <div class="stat-value">${t().hands[best.cat]}</div></div>
      <div><div class="stat-title">${t().winChance(state.opponents)}</div>
           <div class="stat-value">${winPercent}%</div></div>
    </div>${boardPrompt}`;
}

function renderOpponentPicker() {
  document.getElementById('opponent-picker').innerHTML = [1, 2, 3, 4].map((n) =>
    `<button type="button" data-opponents="${n}" class="${n === state.opponents ? 'selected' : ''}">${n}</button>`
  ).join('');
}

function renderSuitTabs() {
  document.getElementById('suit-tabs').innerHTML = Poker.SUITS.map((s) => {
    const count = state.selected.filter((c) => c.s === s).length;
    const badge = count ? `<span class="badge">${count}</span>` : '';
    return `<button type="button" data-suit="${s}" class="${s === state.suit ? 'selected' : ''}">
      <span class="${SUIT_INFO[s].red ? 'red' : ''}">${SUIT_INFO[s].symbol}</span>${badge}
    </button>`;
  }).join('');
}

function renderRankGrid() {
  const full = state.selected.length >= MAX_CARDS;
  document.getElementById('rank-grid').innerHTML = Poker.RANKS.map((r) => {
    const card = { r, s: state.suit };
    const selected = isSelected(card);
    return cardHTML(card, { selected, dim: full && !selected });
  }).join('');
}

function renderChrome() {
  document.documentElement.lang = state.lang;
  document.title = t().title;
  document.getElementById('title').textContent = t().title;
  document.getElementById('reset').textContent = t().reset;
  document.getElementById('lang-toggle').textContent = t().langButton;
  document.getElementById('hole-title').textContent = t().holeTitle;
  document.getElementById('board-title').textContent = t().boardTitle;
  document.getElementById('opponents-label').textContent = t().opponents;
}

function render() {
  renderChrome();
  renderZones();
  renderStatus();
  renderOpponentPicker();
  renderSuitTabs();
  renderRankGrid();
}

// ---- Events (delegated, so re-rendering never loses handlers) ----

document.addEventListener('click', (event) => {
  const cardEl = event.target.closest('.card[data-card]');
  if (cardEl) {
    const id = cardEl.dataset.card;
    toggleCard({ r: parseInt(id, 10), s: id.slice(-1) });
    return;
  }
  const suitEl = event.target.closest('button[data-suit]');
  if (suitEl) {
    state.suit = suitEl.dataset.suit;
    saveState();
    render();
    return;
  }
  const oppEl = event.target.closest('button[data-opponents]');
  if (oppEl) {
    state.opponents = parseInt(oppEl.dataset.opponents, 10);
    saveState();
    render();
  }
});

document.getElementById('reset').addEventListener('click', () => {
  state.selected = [];
  saveState();
  render();
});

document.getElementById('lang-toggle').addEventListener('click', () => {
  state.lang = state.lang === 'ko' ? 'en' : 'ko';
  saveState();
  render();
});

// Deep-link / test hook: ?cards=14s,13s,12s,11s,10s&opp=2 preloads a hand
// (rank 2...14 + suit s/h/d/c), overriding whatever was stored.
function applyQueryOverrides() {
  const params = new URLSearchParams(location.search);
  if (params.has('cards')) {
    state.selected = params.get('cards').split(',')
      .map((id) => ({ r: parseInt(id, 10), s: id.slice(-1) }))
      .filter((c) => Poker.RANKS.includes(c.r) && Poker.SUITS.includes(c.s))
      .slice(0, MAX_CARDS);
  }
  const opp = parseInt(params.get('opp'), 10);
  if ([1, 2, 3, 4].includes(opp)) state.opponents = opp;
}

loadState();
applyQueryOverrides();
render();

// Temporary layout debug: open with #debug to print element widths.
if (location.hash === '#debug') {
  const w = (sel) => `${sel}:${document.querySelector(sel)?.scrollWidth}`;
  document.getElementById('footer').textContent =
    ['html', 'body', 'main', '.panel', '.card-row', '.rank-grid', '.suit-tabs', 'header']
      .map(w).join(' | ') + ` | innerWidth:${window.innerWidth}`;
}
