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
    // Draw stack rules: Wild + cards (+4, +6, +10) can be placed on top of +2 or same type cards
    if (drawStack > 0) {
        // Allow Wild + cards (+4, +6, +10) to be played on top of +2
        if (["+4", "+6", "+10"].includes(card.value) && topCard.value === "+2") {
            return true;
        }

        // Allow Wild + cards to be placed on top of each other (same type or lower)
        if (card.value === "+4" && (topCard.value === "+4" || topCard.value === "normal")) {
            return true;
        }
        if (card.value === "+6" && (topCard.value === "+6" || topCard.value === "normal")) {
            return true;
        }
        if (card.value === "+10" && (topCard.value === "+10" || topCard.value === "normal")) {
            return true;
        }

        // Prevent placing +4 on top of +6 or +10, and +6 on top of +10
        if ((card.value === "+4" && (topCard.value === "+6" || topCard.value === "+10")) ||
            (card.value === "+6" && topCard.value === "+10")) {
            return false;
        }

        // Otherwise, restrict Wild + cards from being placed on each other
        return false;
    }

    // Wild cards are always playable
    if (card.color === "wild") return true;

    // Otherwise, match the active color or value
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
