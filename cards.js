const COLORS = ["red", "blue", "green", "yellow"];
const VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "+2"];

function createDeck() {
  const deck = [];

  COLORS.forEach(color => {
    VALUES.forEach(value => {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "+4" });
    deck.push({ color: "wild", value: "+6" });
    deck.push({ color: "wild", value: "+10" });
  }

  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isValidPlay(card, topCard, activeColor, drawStack) {

  if (drawStack > 0) {
    const order = { "+2": 2, "+4": 4, "+6": 6, "+10": 10 };

    if (!order[card.value] || !order[topCard.value]) return false;

    // Must be equal or higher
    return order[card.value] >= order[topCard.value];
  }

  // Wild is always playable
  if (card.color === "wild") return true;

  // Normal UNO rule
  return card.color === activeColor || card.value === topCard.value;
}

function dealHands(deck, players, cardsPerPlayer = 7) {
  const hands = {};
  players.forEach(id => {
    hands[id] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[id].push(deck.pop());
    }
  });
  return hands;
}

module.exports = {
  createDeck,
  isValidPlay,
  dealHands
};
