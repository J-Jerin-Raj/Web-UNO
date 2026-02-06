const socket = io();

let myId = null;
let myIndex = null;

const handDiv = document.getElementById("hand");
const discardDiv = document.getElementById("discard-pile");
const drawPile = document.getElementById("draw-pile");

socket.on("playerData", data => {
  myId = data.id;
  myIndex = data.index;
});

socket.on("gameState", state => {
  const myHand = state.hands[myId];
  const isMyTurn = state.players[state.currentTurn] === myId;

  renderHand(myHand, isMyTurn);
  renderDiscard(state.discardPile);
});

function renderHand(hand, isMyTurn) {
  handDiv.innerHTML = "";

  hand.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = `card ${card.color}`;
    div.innerText = card.value;

    if (isMyTurn) {
      div.onclick = () => socket.emit("playCard", index);
    } else {
      div.style.opacity = "0.5";
    }

    handDiv.appendChild(div);
  });
}

function renderDiscard(card) {
  discardDiv.className = `pile ${card.color}`;
  discardDiv.innerText = card.value;
}

drawPile.onclick = () => {
  socket.emit("drawCard");
};
