const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const COLORS = ["red", "blue", "green", "yellow"];

let players = [];
let deck = [];
let hands = {};
let discardPile = null;
let currentTurn = 0;

/* ---------- GAME LOGIC ---------- */

function createDeck() {
  deck = [];
  COLORS.forEach(color => {
    for (let i = 0; i <= 9; i++) {
      deck.push({ color, value: i });
    }
  });
  deck.sort(() => Math.random() - 0.5);
}

function startGame() {
  createDeck();
  hands = {};

  players.forEach(id => {
    hands[id] = [];
    for (let i = 0; i < 7; i++) {
      hands[id].push(deck.pop());
    }
  });

  discardPile = deck.pop();
  currentTurn = 0;

  io.emit("gameState", {
    hands,
    discardPile,
    currentTurn,
    players
  });
}

/* ---------- SOCKET EVENTS ---------- */

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  if (players.length < 4) {
    players.push(socket.id);
    hands[socket.id] = [];
  }

  socket.emit("playerData", {
    id: socket.id,
    index: players.indexOf(socket.id)
  });

  if (players.length >= 2) {
    startGame();
  }

  socket.on("playCard", cardIndex => {
    const playerId = socket.id;

    if (players[currentTurn] !== playerId) return;

    const card = hands[playerId][cardIndex];
    if (
      card.color === discardPile.color ||
      card.value === discardPile.value
    ) {
      discardPile = card;
      hands[playerId].splice(cardIndex, 1);
      currentTurn = (currentTurn + 1) % players.length;

      io.emit("gameState", {
        hands,
        discardPile,
        currentTurn,
        players
      });
    }
  });

  socket.on("drawCard", () => {
    const playerId = socket.id;
    if (players[currentTurn] !== playerId) return;

    hands[playerId].push(deck.pop());
    currentTurn = (currentTurn + 1) % players.length;

    io.emit("gameState", {
      hands,
      discardPile,
      currentTurn,
      players
    });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter(id => id !== socket.id);
    delete hands[socket.id];
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
