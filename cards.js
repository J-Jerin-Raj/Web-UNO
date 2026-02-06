const COLORS = ["red", "blue", "green", "yellow"];
const VALUES = ["0","1","2","3","4","5","6","7","8","9","skip","reverse","+2","+6","+10"];

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

function isValidPlay(card, topCard, drawStack) {
  if (drawStack > 0) {
    return ["+2", "+4", "skip", "reverse"].includes(card.value);
  }

  return (
    card.color === topCard.color ||
    card.value === topCard.value ||
    card.color === "wild"
  );
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
