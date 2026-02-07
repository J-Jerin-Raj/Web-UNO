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
        const card = hand[index];
        if (!card) return;

        // Validate play FIRST (wilds allowed)
        if (!isValidPlay(card, discardPile, activeColor, drawStack)) {
            socket.emit("invalidPlay");
            return; // Reject the play if invalid
        }

        // Apply color AFTER validation if it's a wild card
        if (card.color === "wild") {
            if (!chosenColor) return;  // Must choose color for wild
            activeColor = chosenColor;
        } else {
            activeColor = card.color;  // Normal card, set active color to card's color
        }

        // Remove the card from hand
        hand.splice(index, 1);

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
        let drawnCard = null;

        // Draw the cards
        for (let i = 0; i < count; i++) {
            if (deck.length === 0) return;  // Exit if deck is empty
            drawnCard = deck.pop();  // Get the last card from the deck
            hands[socket.id].push(drawnCard);  // Add the card to the player's hand
        }

        // Now check if the drawn card can be played
        const hand = hands[socket.id];
        const index = hand.indexOf(drawnCard);  // Find the index of the drawn card

        // If the drawn card is valid to play, we simulate the click behavior
        if (isValidPlay(drawnCard, discardPile, activeColor, drawStack)) {
            // If it's a wild card, trigger the color picker
            if (drawnCard.color === "wild") {
                // Since it's a wild card, we need to ask for a color choice
                io.to(socket.id).emit("wildCard", { index });
            } else {
                // It's a valid non-wild card, play it like a click
                socket.emit("playCard", { index });
                // Immediately move to the next turn since the card has been played
                nextTurn();
                return;  // Prevent going to next turn again
            }
        } else {
            // If the card is not valid, proceed to the next turn
            nextTurn();
        }

        // Reset the draw stack after drawing a card
        drawStack = 0;

        // Broadcast the updated game state
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
