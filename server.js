const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createDeck, isValidPlay, dealHands } = require("./cards");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = [];
let hands = {};
let deck = [];
let discardPile = null;
let currentTurn = 0;
let direction = 1;
let drawStack = 0;

io.on("connection", socket => {
  players.push(socket.id);

  socket.emit("playerData", {
    id: socket.id,
    index: players.length - 1
  });

  if (players.length >= 2 && deck.length === 0) {
    startGame();
  }

  socket.on("playCard", index => {
    if (players[currentTurn] !== socket.id) return;

    const card = hands[socket.id][index];
    if (!isValidPlay(card, discardPile, drawStack)) return;

    hands[socket.id].splice(index, 1);
    discardPile = card;

    if (card.value === "+2") drawStack += 2;
    if (card.value === "+4") drawStack += 4;

    if (card.value === "reverse") direction *= -1;
    if (card.value === "skip") nextTurn();

    nextTurn();
    broadcast();
  });

  socket.on("drawCard", () => {
    if (players[currentTurn] !== socket.id) return;

    const drawAmount = drawStack || 1;
    for (let i = 0; i < drawAmount; i++) {
      hands[socket.id].push(deck.pop());
    }

    drawStack = 0;
    nextTurn();
    broadcast();
  });

  socket.on("disconnect", () => {
    players = players.filter(p => p !== socket.id);
    delete hands[socket.id];
  });
});

function startGame() {
  deck = createDeck();
  hands = dealHands(deck, players);
  discardPile = deck.pop();
  currentTurn = 0;
  direction = 1;
  drawStack = 0;
  broadcast();
}

function nextTurn() {
  currentTurn = (currentTurn + direction + players.length) % players.length;
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

server.listen(3000, () => {
  console.log("🔥 UNO No Mercy running on http://localhost:3000");
});
