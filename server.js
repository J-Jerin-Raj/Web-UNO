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

/* ---------- HELPERS ---------- */

function startGame() {
    deck = createDeck();
    hands = dealHands(deck, players);

    // Ensure first discard is NOT wild +4
    do {
        discardPile = deck.pop();
    } while (discardPile.color === "wild");

    currentTurn = 0;
    direction = 1;
    drawStack = 0;

    broadcast();
}

function nextTurn() {
    currentTurn =
        (currentTurn + direction + players.length) % players.length;
}

function broadcast() {
    io.emit("gameState", {
        players,
        hands,
        discardPile,
        currentTurn,
        drawStack
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
        const index = data.index;
        const chosenColor = data.chosenColor;

        if (players[currentTurn] !== socket.id) return;

        const hand = hands[socket.id];
        const card = hand[index];
        if (card.color === "wild" && chosenColor) {
            card.color = chosenColor;
        }

        if (!card) return;

        if (!isValidPlay(card, discardPile, drawStack)) {
            socket.emit("invalidPlay");
            return;
        }

        hand.splice(index, 1);
        discardPile = card;

        // 🏆 WIN CHECK
        if (hand.length === 0) {
            io.emit("gameOver", socket.id);
            startGame();
            return;
        }


        if (card.value === "+2") drawStack += 2;
        if (card.value === "+4") drawStack += 4;
        if (card.value === "+6") drawStack += 6;
        if (card.value === "+10") drawStack += 10;
        if (card.value === "reverse") {
            if (drawStack > 0) {
                direction *= -1;
                nextTurn();
                nextTurn();
                broadcast();
                return;
            }
            direction *= -1;
        }
        if (card.value === "skip") nextTurn();

        nextTurn();
        broadcast();
    });

    socket.on("drawCard", () => {
        if (players[currentTurn] !== socket.id) return;

        const count = drawStack || 1;
        for (let i = 0; i < count; i++) {
            if (deck.length === 0) return;
            hands[socket.id].push(deck.pop()); // ✅ SAFE NOW
        }

        drawStack = 0;
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
