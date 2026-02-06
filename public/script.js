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
  if (state.drawStack > 0) {
    drawPile.innerText = `DRAW (${state.drawStack})`;
  } else {
    drawPile.innerText = "DRAW";
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
    div.className = `card ${card.color}`;
    div.innerText = card.value;

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
  if (!card) {
    discardDiv.className = "pile";
    discardDiv.innerText = "";
    return;
  }

  discardDiv.className = `pile ${card.color}`;
  discardDiv.innerText = card.value;
}

drawPile.onclick = () => {
  socket.emit("drawCard");
};
