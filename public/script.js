const menu = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");

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
let pendingWildIndex = null;

document.querySelectorAll(".colors button").forEach(btn => {
  btn.onclick = () => {
    const chosenColor = btn.dataset.color;
    colorPicker.classList.add("d-none");

    socket.emit("playCard", {
      index: pendingWildIndex,
      chosenColor
    });

    pendingWildIndex = null;
  };
});

socket.on("playerData", data => {
  myId = data.id;
  myIndex = data.index;
});

socket.on("gameState", state => {
  if (!myId) return;
  if (!state.hands || !state.hands[myId]) return;

  discardDiv.className = `pile ${state.activeColor}`;

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

// Listen for the wildCard event from the server
socket.on("wildCard", data => {
    const { index } = data;  // Get the index of the drawn wild card
    pendingWildIndex = index;  // Store the index of the pending wild card
    colorPicker.classList.remove("d-none");  // Show the color picker for the player to select a color
});

// When the player selects a color for the wild card
document.querySelectorAll(".colors button").forEach(btn => {
    btn.onclick = () => {
        const chosenColor = btn.dataset.color;  // Get the selected color
        colorPicker.classList.add("d-none");  // Hide the color picker

        // Emit the playCard event with the wild card index and the chosen color
        socket.emit("playCard", {
            index: pendingWildIndex,  // The index of the wild card
            chosenColor  // The color chosen by the player
        });

        pendingWildIndex = null;  // Reset the pending wild card index
    };
});

// Draw pile click handler
drawPile.onclick = () => {
    socket.emit("drawCard");
};

function getCardImage(card) {
  const color = card.color;
  let value = card.value;

  if (value.includes("+")) {
    value = value.replace("+", "plus");
  }

  const fileName = `${color}_${value}.png`;
  return `/cards/${fileName}`;
}
