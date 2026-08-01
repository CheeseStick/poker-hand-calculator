'use strict';

// Poker domain logic, ported from the Learn Poker iOS app.
// Cards are plain objects { r: 2...14, s: 's'|'h'|'d'|'c' }.
const Poker = (() => {
  const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const SUITS = ['s', 'h', 'd', 'c'];

  // Weakest → strongest, same ordering as the app's HandCategory.
  const CATEGORY = {
    HIGH_CARD: 1, ONE_PAIR: 2, TWO_PAIR: 3, TRIPS: 4, STRAIGHT: 5,
    FLUSH: 6, FULL_HOUSE: 7, QUADS: 8, STRAIGHT_FLUSH: 9, ROYAL_FLUSH: 10,
  };

  const cardId = (card) => `${card.r}${card.s}`;
  const sameCard = (a, b) => a.r === b.r && a.s === b.s;

  function fullDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
    return deck;
  }

  function deckExcluding(cards) {
    const used = new Set(cards.map(cardId));
    return fullDeck().filter((card) => !used.has(cardId(card)));
  }

  // Returns the straight's high rank for 5 distinct descending ranks, or 0.
  function straightHigh(ranks) {
    if (new Set(ranks).size !== 5) return 0;
    if (ranks[0] - ranks[4] === 4) return ranks[0];
    if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) return 5; // wheel
    return 0;
  }

  // Evaluates exactly five cards → { cat, tb, cards } where tb is the
  // tiebreaker rank list (most significant first).
  function evaluate5(cards) {
    const sorted = [...cards].sort((a, b) => b.r - a.r);
    const ranks = sorted.map((c) => c.r);
    const isFlush = new Set(sorted.map((c) => c.s)).size === 1;
    const high = straightHigh(ranks);

    if (isFlush && high) {
      return { cat: high === 14 ? CATEGORY.ROYAL_FLUSH : CATEGORY.STRAIGHT_FLUSH, tb: [high], cards: sorted };
    }

    // Group ranks by multiplicity: (count desc, rank desc) first.
    const counts = new Map();
    for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
    const groups = [...counts.entries()]
      .map(([r, n]) => ({ r, n }))
      .sort((a, b) => b.n - a.n || b.r - a.r);
    const tb = groups.map((g) => g.r);

    const [first, second] = [groups[0].n, groups[1] ? groups[1].n : 0];
    if (first === 4) return { cat: CATEGORY.QUADS, tb, cards: sorted };
    if (first === 3 && second === 2) return { cat: CATEGORY.FULL_HOUSE, tb, cards: sorted };
    if (first === 3) return { cat: CATEGORY.TRIPS, tb, cards: sorted };
    if (first === 2 && second === 2) return { cat: CATEGORY.TWO_PAIR, tb, cards: sorted };
    if (first === 2) return { cat: CATEGORY.ONE_PAIR, tb, cards: sorted };
    if (isFlush) return { cat: CATEGORY.FLUSH, tb: ranks, cards: sorted };
    if (high) return { cat: CATEGORY.STRAIGHT, tb: [high], cards: sorted };
    return { cat: CATEGORY.HIGH_CARD, tb: ranks, cards: sorted };
  }

  // category first, then tiebreakers lexicographically. Suits never matter.
  function compareHands(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    for (let i = 0; i < Math.min(a.tb.length, b.tb.length); i += 1) {
      if (a.tb[i] !== b.tb[i]) return a.tb[i] - b.tb[i];
    }
    return 0;
  }

  function combinations5(cards) {
    const result = [];
    const n = cards.length;
    for (let a = 0; a < n - 4; a += 1)
      for (let b = a + 1; b < n - 3; b += 1)
        for (let c = b + 1; c < n - 2; c += 1)
          for (let d = c + 1; d < n - 1; d += 1)
            for (let e = d + 1; e < n; e += 1)
              result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    return result;
  }

  // Best 5-card hand from 5...7 cards.
  function bestHand(cards) {
    if (cards.length === 5) return evaluate5(cards);
    let best = null;
    for (const combo of combinations5(cards)) {
      const hand = evaluate5(combo);
      if (!best || compareHands(hand, best) > 0) best = hand;
    }
    return best;
  }

  // What 1...4 cards already make: pairs/trips/quads or a high card.
  function partialHand(cards) {
    const counts = new Map();
    for (const card of cards) {
      if (!counts.has(card.r)) counts.set(card.r, []);
      counts.get(card.r).push(card);
    }
    const groups = [...counts.values()].sort((a, b) => b.length - a.length || b[0].r - a[0].r);

    const [first, second] = [groups[0].length, groups[1] ? groups[1].length : 0];
    if (first === 4) return { cat: CATEGORY.QUADS, core: groups[0] };
    if (first === 3) return { cat: CATEGORY.TRIPS, core: groups[0] };
    if (first === 2 && second === 2) return { cat: CATEGORY.TWO_PAIR, core: [...groups[0], ...groups[1]] };
    if (first === 2) return { cat: CATEGORY.ONE_PAIR, core: groups[0] };
    return { cat: CATEGORY.HIGH_CARD, core: [groups[0][0]] };
  }

  // The category-defining cards of a full hand (kickers excluded).
  function coreCards(hand) {
    switch (hand.cat) {
      case CATEGORY.HIGH_CARD:
      case CATEGORY.ONE_PAIR:
      case CATEGORY.TRIPS:
      case CATEGORY.QUADS:
        return hand.cards.filter((c) => c.r === hand.tb[0]);
      case CATEGORY.TWO_PAIR:
        return hand.cards.filter((c) => c.r === hand.tb[0] || c.r === hand.tb[1]);
      default:
        return hand.cards;
    }
  }

  // Draws `count` random cards from `deck` (partial Fisher-Yates, in place).
  function drawRandom(deck, count) {
    for (let i = 0; i < count; i += 1) {
      const j = i + Math.floor(Math.random() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, count);
  }

  // Monte Carlo win-or-tie probability versus `opponents` random hands.
  function equity(hole, board, opponents, iterations = 500) {
    let score = 0;
    const base = deckExcluding([...hole, ...board]);

    for (let i = 0; i < iterations; i += 1) {
      const drawn = drawRandom([...base], 5 - board.length + opponents * 2);
      const fullBoard = [...board, ...drawn.slice(0, 5 - board.length)];
      const mine = bestHand([...hole, ...fullBoard]);

      let best = mine;
      let winners = 1;
      for (let o = 0; o < opponents; o += 1) {
        const start = 5 - board.length + o * 2;
        const theirs = bestHand([...drawn.slice(start, start + 2), ...fullBoard]);
        const diff = compareHands(theirs, best);
        if (diff > 0) { best = theirs; winners = 1; }
        else if (diff === 0) winners += 1;
      }
      if (best === mine) score += 1 / winners;
    }
    return score / iterations;
  }

  return { RANKS, SUITS, CATEGORY, cardId, sameCard, fullDeck, evaluate5, compareHands, bestHand, partialHand, coreCards, equity };
})();

// Allow `node` to import this file for the test script.
if (typeof module !== 'undefined') module.exports = Poker;
