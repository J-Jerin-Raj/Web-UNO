const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createDeck, isValidPlay, dealHands } = require("./cards.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ---------- GAME STATE ---------- */

let players = [];
let hands = {};
let deck = [];
let discardPile = null;
let currentTurn = 0;
let direction = 1;
let drawStack = 0;
let activeColor = null;

/* ---------- HELPERS ---------- */

function startGame() {
    deck = createDeck();
    hands = dealHands(deck, players);

    // Ensure first discard is NOT wild +4
    do {
        discardPile = deck.pop();
        activeColor = discardPile.color;
    } while (discardPile.color === "wild");

    currentTurn = 0;
    direction = 1;
    drawStack = 0;

    broadcast();
}

function nextTurn() {
    if (direction === 1) {
        // Move to the next player (clockwise)
        currentTurn = (currentTurn + 1) % players.length;
    } else {
        // Move to the previous player (counterclockwise)
        currentTurn = (currentTurn - 1 + players.length) % players.length;
    }
}

function broadcast() {
    io.emit("gameState", {
        players,
        hands,
        discardPile,
        currentTurn,
        drawStack,
        activeColor
    });
}

function refillDeckFromDiscard() {
    if (!discardPile) return;

    const top = discardPile;
    // Gather all remaining cards except the top discard
    const allCards = Object.values(hands).flat();
    deck = [...allCards];
    discardPile = top;
}

/* ---------- SOCKET ---------- */

io.on("connection", socket => {
    console.log("Connected:", socket.id);

    // Add player
    players.push(socket.id);
    hands[socket.id] = []; // 🔥 IMPORTANT

    socket.emit("playerData", {
        id: socket.id,
        index: players.length - 1
    });

    // Start game when 2+ players
    if (players.length >= 2 && deck.length === 0) {
        startGame();
    } else {
        broadcast();
    }

    socket.on("playCard", data => {
        if (players[currentTurn] !== socket.id) return;

        const { index, chosenColor } = data;
        const hand = hands[socket.id];
        let card;

        if (index === -1 && data.drawnCard) {
            // This is a forced-play drawn card (wild case)
            card = data.drawnCard;
        } else {
            card = hand[index];
        }

        if (!card) return;

        // Validate play FIRST (wilds allowed)
        if (!isValidPlay(card, discardPile, activeColor, drawStack)) {
            socket.emit("invalidPlay");
            return;
        }

        // ---- FIX: Proper Wild Handling (from HAND or DRAW) ----
        if (card.color === "wild") {
            // If player hasn't chosen a color yet → ask for one
            if (!chosenColor) {
                socket.emit("wildCard", { index });
                return;
            }
            activeColor = chosenColor;
        } else {
            activeColor = card.color;
        }

        // Remove the card from hand ONLY if it was actually from the hand
        if (index !== -1) {
            hand.splice(index, 1);
        }

        if (hand.length === 0) {
            io.emit("gameOver", socket.id);
            return;
        }

        // Update discard pile
        discardPile = card;

        // Apply draw stack effects
        if (card.value === "+2") drawStack += 2;
        if (card.value === "+4") drawStack += 4;
        if (card.value === "+6") drawStack += 6;
        if (card.value === "+10") drawStack += 10;

        // Special handling for Reverse card
        if (card.value === "reverse") {
            if (players.length === 2) {
                // If there are only two players, skip the other player's turn
                nextTurn();  // Skip the other player's turn (move to next player immediately)
            } else {
                // Normal behavior for Reverse: reverse the direction
                direction *= -1;
            }
        }

        // Apply other card effects (skip, reverse, etc.)
        if (card.value === "skip") nextTurn();

        // Proceed to the next turn
        nextTurn();
        broadcast();  // Broadcast the game state to all players
    });

    socket.on("drawCard", () => {
        if (players[currentTurn] !== socket.id) return;

        const count = drawStack || 1;

        // ----- MULTI-DRAW (stacked + cards) -----
        if (count > 1) {
            for (let i = 0; i < count; i++) {
                if (deck.length === 0) refillDeckFromDiscard();
                if (deck.length === 0) return;
                hands[socket.id].push(deck.pop());
            }

            drawStack = 0;
            nextTurn();
            broadcast();
            return;
        }

        // ----- SINGLE DRAW -----
        if (deck.length === 0) refillDeckFromDiscard();
        if (deck.length === 0) return;

        const drawnCard = deck.pop();
        drawStack = 0;

        // Check if playable
        const playable = isValidPlay(drawnCard, discardPile, activeColor, drawStack);

        if (!playable) {
            // ❌ Not playable → goes to hand
            hands[socket.id].push(drawnCard);
            nextTurn();
            broadcast();
            return;
        }

        // ✅ Playable card
        if (drawnCard.color === "wild") {
            // Ask client to choose color instead of auto-playing
            socket.emit("wildCard", { drawnCard });
            return;
        }

        // ✅ Auto-play normal playable card
        discardPile = drawnCard;
        activeColor = drawnCard.color;

        if (drawnCard.value === "+2") drawStack += 2;
        if (drawnCard.value === "+4") drawStack += 4;
        if (drawnCard.value === "+6") drawStack += 6;
        if (drawnCard.value === "+10") drawStack += 10;

        if (drawnCard.value === "reverse") {
            if (players.length === 2) nextTurn();
            else direction *= -1;
        }

        if (drawnCard.value === "skip") nextTurn();

        nextTurn();
        broadcast();
    });

    socket.on("disconnect", () => {
        const i = players.indexOf(socket.id);
        if (i !== -1) {
            players.splice(i, 1);
            delete hands[socket.id];

            if (currentTurn >= players.length) {
                currentTurn = 0;
            }
        }

        // 🔥 RESET GAME WHEN EMPTY
        if (players.length === 0) {
            deck = [];
            hands = {};
            discardPile = null;
            currentTurn = 0;
            direction = 1;
            drawStack = 0;
        }

        broadcast();
    });
});

/* ---------- START ---------- */

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🔥 UNO No Mercy running on port ${PORT}`);
});
