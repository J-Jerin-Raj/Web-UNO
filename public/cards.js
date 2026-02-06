const COLORS = ["red", "blue", "green", "yellow"];

function createDeck() {
  const deck = [];
  COLORS.forEach(color => {
    for (let i = 0; i <= 9; i++) {
      deck.push({ color, value: i });
    }
  });
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isValidPlay(card, topCard) {
  return (
    card.color === topCard.color ||
    card.value === topCard.value
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
