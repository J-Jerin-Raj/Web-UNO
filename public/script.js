const menu = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");
const currentColorText = document.getElementById("current-color-text");

startBtn.onclick = () => {
  menu.style.display = "none";
};

const socket = io();

let myId = null;
let myIndex = null;
let currentDrawStack = 0;

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

  currentDrawStack = state.drawStack;

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
  const spread = Math.min(15, total * 3);
  const startAngle = -spread / 2;

  // 🔥 NEW
  const MAX_HAND_WIDTH = 520;
  const CARD_WIDTH = 85;
  const MIN_SPACING = 14;
  const MAX_SPACING = 38;

  const spacing =
    total <= 1
      ? 0
      : Math.min(
        MAX_SPACING,
        Math.max(
          MIN_SPACING,
          (MAX_HAND_WIDTH - CARD_WIDTH) / (total - 1)
        )
      );

  hand.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = "card";
    div.style.background = `url(${getCardImage(card)}) center/cover no-repeat`;

    const angle =
      total === 1
        ? 0
        : startAngle + (spread / (total - 1)) * index;

    const offsetX = (index - (total - 1) / 2) * spacing;

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
          const discardEl = document.getElementById("discard-pile");

          animateCardFly(div, discardEl, getCardImage(card));

          setTimeout(() => {
            socket.emit("playCard", { index });
          }, 150);
        }
      };
    } else {
      div.style.opacity = "0.5";
    }

    handDiv.appendChild(div);
  });
}

function animateCardFly(fromEl, toEl, imageUrl) {
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const card = document.createElement("div");
  card.className = "card";
  card.style.background = `url(${imageUrl}) center/cover no-repeat`;
  card.style.position = "fixed";
  card.style.left = `${fromRect.left}px`;
  card.style.top = `${fromRect.top}px`;
  card.style.zIndex = 9999;
  card.style.pointerEvents = "none";

  document.body.appendChild(card);

  card.animate(
    [
      {
        transform: "scale(1) rotate(0deg)",
        left: `${fromRect.left}px`,
        top: `${fromRect.top}px`
      },
      {
        transform: "scale(1.2) rotate(180deg)",
        left: `${toRect.left}px`,
        top: `${toRect.top}px`
      }
    ],
    {
      duration: 400,
      easing: "cubic-bezier(0.25, 0.8, 0.25, 1)"
    }
  );

  setTimeout(() => card.remove(), 400);
}

function animateDrawToHand(drawPileEl, imageUrl) {
  if (!drawPileEl) return;

  const fromRect = drawPileEl.getBoundingClientRect();
  const handRect = handDiv.getBoundingClientRect();

  const cardWidth = 80;      // match your .card width
  const spacing = 35;       // same spacing as renderHand

  const cardCount = handDiv.children.length;

  // RIGHT end of hand
  const targetX =
    handRect.left +
    handRect.width / 2 +
    (cardCount - 1) * spacing;

  const targetY =
    handRect.top + handRect.height / 2 - 40;

  const card = document.createElement("div");
  card.className = "card";
  card.style.background = `url(${imageUrl}) center/cover no-repeat`;
  card.style.position = "fixed";
  card.style.left = `${fromRect.left}px`;
  card.style.top = `${fromRect.top}px`;
  card.style.zIndex = 9999;
  card.style.pointerEvents = "none";

  document.body.appendChild(card);

  card.animate(
    [
      { transform: "scale(0.9)", left: `${fromRect.left}px`, top: `${fromRect.top}px` },
      { transform: "scale(1)", left: `${targetX}px`, top: `${targetY}px` }
    ],
    {
      duration: 350,
      easing: "ease-out"
    }
  );

  setTimeout(() => card.remove(), 550);
}

function animateMultipleDraws(count) {
  const delayBetweenCards = 180;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      animateDrawToHand(drawPile, "/cards/back.png");
    }, i * delayBetweenCards);
  }
}

drawPile.onclick = () => {
  const count = Math.max(1, currentDrawStack || 1);
  
  animateMultipleDraws(count);
  socket.emit("drawCard");
};

function renderDiscard(card) {
  if (!card) return;

  discardDiv.style.background =
    `url(${getCardImage(card)}) center/cover no-repeat`;
}

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
