const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const { createDeck, isValidPlay, dealHands, shuffle } = require("./cards.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const URL = process.env.URL;

/* ---------- GAME STATE ---------- */

const MAX_PLAYERS = 4;
let players = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    seat: i,
    socketId: null,
    connected: false
}));

let hands = {};
for (let i = 0; i < MAX_PLAYERS; i++) hands[i] = [];
let deck = [];
let discardPile = null;
let discardHistory = [];
let currentTurn = 0;
let direction = 1;
let drawStack = 0;
let activeColor = null;

/* ---------- HELPERS ---------- */

function saveGame() {

    const savedPlayers = players.map(p => ({
        seat: p.seat,
        token: p.token || null
    }));

    fs.writeFileSync(
        "./data.json",
        JSON.stringify({
            players: savedPlayers,
            hands,
            deck,
            discardPile,
            discardHistory,
            currentTurn,
            direction,
            drawStack,
            activeColor
        }, null, 2)
    );
}

function startGame() {
    deck = createDeck();
    hands = {};
    for (let i = 0; i < MAX_PLAYERS; i++) hands[i] = [];

    const connectedSeats = players.filter(p => p.connected).map(p => p.seat);
    const dealt = dealHands(deck, connectedSeats);

    connectedSeats.forEach(seat => {
        hands[seat] = dealt[seat];
    });

    // Ensure first discard is NOT wild +4
    do {
        discardPile = deck.pop();
        discardHistory = [discardPile];
        activeColor = discardPile.color;
    } while (discardPile.color === "wild");

    currentTurn = 0;
    direction = 1;
    drawStack = 0;

    broadcast();
    saveGame();
}

function nextTurn() {
    do {
        if (direction === 1) {
            currentTurn = (currentTurn + 1) % MAX_PLAYERS;
        } else {
            currentTurn = (currentTurn - 1 + MAX_PLAYERS) % MAX_PLAYERS;
        }
    } while (!players[currentTurn].connected);
}

function broadcast() {
    io.emit("gameState", {
        players: players.map(p => p.connected),
        hands,
        discardPile,
        currentTurn,
        drawStack,
        activeColor
    });
}

function refillDeckFromDiscard() {
    if (discardHistory.length <= 1) return;

    const topCard = discardHistory.pop(); // keep top discard
    deck = shuffle(discardHistory);       // shuffle old discards
    discardHistory = [topCard];           // reset history
    discardPile = topCard;
}

function resetGame() {

    deck = [];

    hands = {};
    for (let i = 0; i < MAX_PLAYERS; i++) hands[i] = [];

    discardPile = null;
    discardHistory = [];
    currentTurn = 0;
    direction = 1;
    drawStack = 0;
    activeColor = null;

    saveGame();
}

if (fs.existsSync("./data.json")) {

    const data = JSON.parse(
        fs.readFileSync("./data.json")
    );

    players = data.players || Array.from({ length: MAX_PLAYERS }, (_, i) => ({
        seat: i,
        socketId: null,
        connected: false
    }));
    while(players.length < MAX_PLAYERS) {
        players.push({ seat: players.length, socketId: null, connected: false });
    }
    players.forEach(p => {
        p.connected = false;
        p.socketId = null;
    });

    players.forEach(p => {
        p.socketId = null;
    });

    if (data.discardPile === null) {

        // Previous game ended
        hands = {};
        for (let i = 0; i < MAX_PLAYERS; i++) hands[i] = [];

        deck = [];

    }
    else {

        hands = data.hands || {};
        for (let i = 0; i < MAX_PLAYERS; i++) {
            if (!hands[i]) hands[i] = [];
        }

        deck = data.deck || [];
    }
    deck = data.deck || [];
    discardPile = data.discardPile;
    discardHistory = data.discardHistory || [];
    currentTurn = data.currentTurn || 0;
    direction = data.direction || 1;
    drawStack = data.drawStack || 0;
    activeColor = data.activeColor || null;
}

/* ---------- SOCKET ---------- */

io.on("connection", socket => {
    
    socket.emit("Cardl", l=URL);

    // Add player
    let seat = players.findIndex(p => !p.connected);
    if (seat === -1) {
        socket.emit("roomFull");
        socket.disconnect(true);
        return;
    }

    players[seat].connected = true;
    players[seat].socketId = socket.id;

    console.log("Connected:", socket.id, "\tActive Player Count:", players.filter(p => p.connected).length);

    socket.seat = seat;

    socket.emit("playerData", {
        id: seat,
        index: seat
    });

    const count = players.filter(p => p.connected).length;

    io.emit("playerCount", count);

    broadcast();
    saveGame();
    
    socket.on("startGame", () => {
        const connectedCount = players.filter(p => p.connected).length;
        if (connectedCount >= 2 && deck.length === 0) {
            startGame();
        }
    });

    socket.on("playCard", data => {
        if (players[currentTurn].socketId !== socket.id) return;

        const { index, chosenColor } = data;
        const hand = hands[socket.seat];
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

        // ---- NEW: Proper Wild Handling + recolor the card ----
        if (card.color === "wild") {
            if (!chosenColor) {
                socket.emit("wildCard", { drawnCard: card, index });
                return;
            }

            // 🔥 IMPORTANT CHANGE: attach chosen color to the card itself
            card = {
                ...card,
                chosenColor: chosenColor
            };

            activeColor = chosenColor;
        } else {
            activeColor = card.color;
        }

        // Remove the card from hand ONLY if it was actually from the hand
        if (index !== -1) {
            hand.splice(index, 1);
        }

        if (hand.length === 0) {
            io.emit("gameOver", socket.seat);
            resetGame();
            return;
        }

        // Update discard pile
        discardPile = card;
        discardHistory.push(card);

        // Apply draw stack effects
        if (card.value === "+2") drawStack += 2;
        if (card.value === "+4") drawStack += 4;
        if (card.value === "+6") drawStack += 6;
        if (card.value === "+10") drawStack += 10;

        // Special handling for Reverse card
        if (card.value === "reverse") {
            if (players.filter(p => p.connected).length === 2) {
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
        saveGame();
    });
    let MultiDraw = false;
    socket.on("drawCard", () => {
        if (players[currentTurn].socketId !== socket.id) return;

        const count = drawStack || 1;

        // ----- MULTI-DRAW (stacked + cards) -----
        if (count > 1) {
            if (deck.length === 0) refillDeckFromDiscard();
            if (deck.length === 0) return;
            hands[socket.seat].push(deck.pop());
            MultiDraw = true;
            drawStack -= 1;
            if (drawStack == 0) {
                nextTurn();
            }
            broadcast();
            saveGame();
            return;
        }

        // ----- SINGLE DRAW -----
        if (deck.length === 0) refillDeckFromDiscard();
        if (deck.length === 0) return;

        const drawnCard = deck.pop();
        drawStack = 0;

        // Check if playable
        const playable = isValidPlay(drawnCard, discardPile, activeColor, drawStack);

        if (!playable || MultiDraw) {
            // ❌ Not playable → goes to hand
            if (count === 1) {
                MultiDraw = false;
            }
            hands[socket.seat].push(drawnCard);
            nextTurn();
            broadcast();
            saveGame();
            return;
        }

        // ✅ Playable card
        if (drawnCard.color === "wild") {
            // Ask client to choose color for THIS drawn card
            socket.emit("wildCard", { drawnCard, fromDraw: true });
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
            if (players.filter(p => p.connected).length === 2) {
                nextTurn();
            }
            else {
                direction *= -1;
            }
        }

        if (drawnCard.value === "skip") nextTurn();

        nextTurn();
        broadcast();
        saveGame();
    });

    socket.on("playAgain", () => {
        const count = players.filter(p => p.connected).length;
        if (count >= 2) {
            startGame();
        }
    });

    socket.on("disconnect", () => {

        if (socket.seat === undefined) return;

        players[socket.seat].connected = false;
        players[socket.seat].socketId = null;

        const ActvPlrCount = players.filter(p => p.connected).length;

        console.log("DisConnected:", socket.id, "\tActive Player Count:", ActvPlrCount);

        broadcast();

        io.emit("playerCount", ActvPlrCount);

        if (ActvPlrCount == 0){
            resetGame();
        }
        else{
            saveGame();
        }
    });
});

/* ---------- START ---------- */

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🔥 UNO No Mercy running on port ${PORT}`);
});
