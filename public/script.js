const menu = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");
const currentColorText = document.getElementById("current-color-text");

startBtn.onclick = () => {
  menu.style.display = "none";
};

const socket = io();

let myId = null;
let myIndex = null;

const handDiv = document.getElementById("hand");
const discardDiv = document.getElementById("discard-pile");
const drawPile = document.getElementById("draw-pile");
const colorPicker = document.getElementById("colorPicker");

let pendingWildIndex = null;  // for wild from HAND
let pendingWildCard = null;   // for wild from DRAW

document.querySelectorAll(".colors button").forEach(btn => {
  btn.onclick = () => {
    const chosenColor = btn.dataset.color;
    colorPicker.classList.add("d-none");

    // Case 1: Wild was drawn from deck
    if (pendingWildCard) {
      socket.emit("playCard", {
        index: -1,
        drawnCard: pendingWildCard,
        chosenColor
      });
      pendingWildCard = null;
      return;
    }

    // Case 2: Wild was played from HAND
    if (pendingWildIndex !== null) {
      socket.emit("playCard", {
        index: pendingWildIndex,
        chosenColor
      });
      pendingWildIndex = null;
    }
  };
});

socket.on("playerData", data => {
  myId = data.id;
  myIndex = data.index;
});

socket.on("gameState", state => {
  if (!myId || !state.players || !state.hands) return;

  if (!state.hands || !state.hands[myId]) return;

  discardDiv.className = "pile";
  discardDiv.classList.add(state.activeColor);

  // 👉 ADD THIS LINE:
  currentColorText.textContent = state.activeColor ? state.activeColor.toUpperCase() : "—";


  const myHand = state.hands[myId];
  const isMyTurn = state.players[state.currentTurn] === myId;

  renderHand(myHand, isMyTurn);
  renderDiscard(state.discardPile);

  drawPile.style.background =
    "url(/cards/back.png) center/cover no-repeat";

  if (state.drawStack > 0) {
    drawPile.innerHTML = `<span class="stack">${state.drawStack}</span>`;
  } else {
    drawPile.innerHTML = "";
  }
});

socket.on("gameOver", winnerId => {
  if (winnerId === myId) {
    alert("🔥 YOU WIN 🔥");
  } else {
    alert("💀 You lost");
  }
});

socket.on("invalidPlay", () => {
  alert("❌ Invalid move!");
});

socket.on("wildCard", data => {
  const { drawnCard } = data;

  // Store the card temporarily
  pendingWildCard = drawnCard;

  // Show color picker
  colorPicker.classList.remove("d-none");
});

function renderHand(hand, isMyTurn) {
  handDiv.innerHTML = "";
  handDiv.style.filter = isMyTurn ? "drop-shadow(0 0 15px gold)" : "none";

  const total = hand.length;
  const spread = Math.min(15, total * 3); // fan width
  const startAngle = -spread / 2;

  hand.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = "card";
    div.style.background = `url(${getCardImage(card)}) center/cover no-repeat`;

    const angle = startAngle + (spread / (total - 1 || 1)) * index;
    const offsetX = (index - total / 2) * 35;

    div.style.transform = `
      translateX(${offsetX}px)
      rotate(${angle}deg)
    `;
    div.style.zIndex = index;

    if (isMyTurn) {
      div.onclick = () => {
        if (card.color === "wild") {
          pendingWildIndex = index;
          colorPicker.classList.remove("d-none");
        } else {
          socket.emit("playCard", { index });
        }
      };
    } else {
      div.style.opacity = "0.5";
    }

    handDiv.appendChild(div);
  });
}

function renderDiscard(card) {
  if (!card) return;

  discardDiv.style.background =
    `url(${getCardImage(card)}) center/cover no-repeat`;
}

drawPile.onclick = () => {
  socket.emit("drawCard");
};

function getCardImage(card) {
  let color = card.color; // usually "red", "blue", "green", "yellow" or "wild"
  let value = card.value; // "wild", "+4", "+6", "+10", etc.

  if (value.includes("+")) {
    value = value.replace("+", "plus"); // "+4" -> "plus4"
  }

  if (card.color === "wild" && card.chosenColor) {
    // 🔥 YOUR REQUESTED FORMAT:
    // wild_plus4_blue.png
    return `/cards/wild_${value}_${card.chosenColor}.png`;
  }

  // Normal cards: red_5.png, blue_skip.png, etc.
  return `/cards/${color}_${value}.png`;
}
