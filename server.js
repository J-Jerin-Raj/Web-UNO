const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const { createDeck, isValidPlay, dealHands, shuffle } = require("./cards.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ---------- GAME STATE ---------- */

let players = [
    {
        seat: 0,
        socketId: null,
        connected: false
    },
    {
        seat: 1,
        socketId: null,
        connected: false
    }
];

let hands = {
    0: [],
    1: []
};
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
    hands = {
        0: [],
        1: []
    };

    const dealt = dealHands(deck, [0, 1]);

    hands[0] = dealt[0];
    hands[1] = dealt[1];

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

    hands = {
        0: [],
        1: []
    };

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

    players = data.players || [
        {
            seat: 0,
            socketId: null,
            connected: false
        },
        {
            seat: 1,
            socketId: null,
            connected: false
        }
    ];
    players.forEach(p => {
        p.connected = false;
        p.socketId = null;
    });

    players.forEach(p => {
        p.socketId = null;
    });

    if (data.discardPile === null) {

        // Previous game ended
        hands = {
            0: [],
            1: []
        };

        deck = [];

    }
    else {

        hands = data.hands || {
            0: [],
            1: []
        };

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

    // Add player
    let seat = -1;

    if (!players[0].connected) {
        seat = 0;
    }
    else if (!players[1].connected) {
        seat = 1;
    }
    else {
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

    if (count === 2 && deck.length === 0) {
        startGame();      // startGame() already saves the game
    } else {
        broadcast();
        saveGame();       // Save waiting room state
    }

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

        const count = players.filter(
            p => p.connected
        ).length;

        if (count === 2) {
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
