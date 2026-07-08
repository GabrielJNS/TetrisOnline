const firebaseConfig = {
    apiKey: "AIzaSyDjyK1m44L76tvpRtV6KhEmHHumHxeNqy4",
    authDomain: "meu-jogo-velha.firebaseapp.com",
    databaseURL: "https://meu-jogo-velha-default-rtdb.firebaseio.com",
    projectId: "meu-jogo-velha",
    storageBucket: "meu-jogo-velha.firebasestorage.app",
    messagingSenderId: "699322233191",
    appId: "1:699322233191:web:cbf9ca5cc9153b2b2b7fc2"
};

firebase.initializeApp(firebaseConfig);
firebase.auth().signInAnonymously();

const db = firebase.database();

const lobbyDiv = document.getElementById("lobby");
const gameAreaDiv = document.getElementById("game-area");
const createBtn = document.getElementById("create-room");
const shareBtn = document.getElementById("share-room");
const resetBtn = document.getElementById("reset-game");
const exitBtn = document.getElementById("exit-game");
const playerNameInput = document.getElementById("player-name");
const roomCodeSpan = document.getElementById("room-code");
const waitingMsg = document.getElementById("waiting-msg");
const roomInfoDiv = document.getElementById("room-info");
const playersListDiv = document.getElementById("players-list");
const playersCountSpan = document.getElementById("players-count");
const gameModeSelect = document.getElementById("game-mode");
const controlsText = document.getElementById("controls-text");
const vsDivider = document.getElementById("vs-divider");
const overlay = document.getElementById("victory-overlay");
const winnerMsgSpan = document.getElementById("winner-message");
const rankingDisplay = document.getElementById("ranking-display");
const closeOverlayBtn = document.getElementById("close-overlay");

let roomId = null;
let myPlayerId = null;
let gameRef = null;
let tetrisGames = {};
let gameStarted = false;
let myName = "";
let keyHandlers = {};
let gameMode = "2players";
let totalPlayers = 2;

window.onload = () => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
        joinRoom(room);
    }
};

class TetrisGame {
    constructor(canvasId, onUpdateStats, onGameOverCallback, playerId, playerIndex) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onUpdateStats = onUpdateStats;
        this.onGameOverCallback = onGameOverCallback;
        this.playerId = playerId;
        this.playerIndex = playerIndex;

        this.cols = 10;
        this.rows = 20;
        this.cellSize = this.canvas.width / this.cols;

        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.piece = null;
        this.score = 0;
        this.lines = 0;
        this.gameOver = false;
        this.intervalId = null;
        this.isActive = false;
        this.dropInterval = 500;

        this.pieces = [
            [[1,1,1,1]],
            [[1,1],[1,1]],
            [[0,1,0],[1,1,1]],
            [[1,0,0],[1,1,1]],
            [[0,0,1],[1,1,1]],
            [[0,1,1],[1,1,0]],
            [[1,1,0],[0,1,1]]
        ];
        this.colors = ['#00e5f0', '#f0e000', '#c084fc', '#f97316', '#3b82f6', '#10b981', '#ef4444'];

        this.spawnPiece();
        this.draw();
    }

    initControls() {
        if (keyHandlers[this.playerId]) {
            window.removeEventListener('keydown', keyHandlers[this.playerId]);
        }

        const controlSets = {
            player1: { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', rotate: 'ArrowUp', drop: ' ' },
            player2: { left: 'a', right: 'd', down: 's', rotate: 'w', drop: 'q' },
            player3: { left: 'j', right: 'l', down: 'k', rotate: 'i', drop: 'u' },
            player4: { left: 'f', right: 'h', down: 'g', rotate: 'r', drop: 't' }
        };

        const controls = controlSets[this.playerId] || controlSets.player1;

        const handler = (e) => {
            if (this.gameOver || !this.isActive) return;
            const key = e.key.toLowerCase();
            if (key === controls.left || e.key === controls.left) {
                e.preventDefault();
                this.move(-1, 0);
            } else if (key === controls.right || e.key === controls.right) {
                e.preventDefault();
                this.move(1, 0);
            } else if (key === controls.down || e.key === controls.down) {
                e.preventDefault();
                this.move(0, 1);
            } else if (key === controls.rotate || e.key === controls.rotate) {
                e.preventDefault();
                this.rotate();
            } else if (key === controls.drop || e.key === controls.drop) {
                e.preventDefault();
                this.hardDrop();
            }
        };

        keyHandlers[this.playerId] = handler;
        window.addEventListener('keydown', handler);
    }

    spawnPiece() {
        const idx = Math.floor(Math.random() * this.pieces.length);
        const shape = this.pieces[idx].map(row => [...row]);
        this.piece = {
            shape: shape,
            x: Math.floor((this.cols - shape[0].length) / 2),
            y: 0,
            color: this.colors[idx]
        };
        if (this.collision()) {
            this.gameOver = true;
            if (this.intervalId) clearInterval(this.intervalId);
            this.onGameOverCallback();
        }
        this.draw();
    }

    collision() {
        for (let y = 0; y < this.piece.shape.length; y++) {
            for (let x = 0; x < this.piece.shape[y].length; x++) {
                if (this.piece.shape[y][x] !== 0) {
                    const boardX = this.piece.x + x;
                    const boardY = this.piece.y + y;
                    if (boardX < 0 || boardX >= this.cols || boardY >= this.rows || boardY < 0) return true;
                    if (boardY >= 0 && this.board[boardY][boardX] !== 0) return true;
                }
            }
        }
        return false;
    }

    merge() {
        for (let y = 0; y < this.piece.shape.length; y++) {
            for (let x = 0; x < this.piece.shape[y].length; x++) {
                if (this.piece.shape[y][x] !== 0) {
                    const boardY = this.piece.y + y;
                    const boardX = this.piece.x + x;
                    if (boardY >= 0 && boardY < this.rows) {
                        this.board[boardY][boardX] = this.piece.color;
                    }
                }
            }
        }
        this.clearLines();
        this.spawnPiece();
        this.draw();
    }

    clearLines() {
        let linesCleared = 0;
        for (let row = this.rows-1; row >= 0; ) {
            let full = true;
            for (let col = 0; col < this.cols; col++) {
                if (this.board[row][col] === 0) {
                    full = false;
                    break;
                }
            }
            if (full) {
                for (let r = row; r > 0; r--) {
                    this.board[r] = [...this.board[r-1]];
                }
                this.board[0] = Array(this.cols).fill(0);
                linesCleared++;
            } else {
                row--;
            }
        }
        if (linesCleared > 0) {
            const points = [0, 40, 100, 300, 1200];
            this.score += points[Math.min(linesCleared,4)];
            this.lines += linesCleared;
            this.onUpdateStats(this.lines, this.score);
        }
    }

    move(dx, dy) {
        if (this.gameOver) return;
        this.piece.x += dx;
        this.piece.y += dy;
        if (this.collision()) {
            this.piece.x -= dx;
            this.piece.y -= dy;
            if (dy === 1) {
                this.merge();
            }
        }
        this.draw();
    }

    rotate() {
        if (this.gameOver) return;
        const oldShape = this.piece.shape;
        const rotated = oldShape[0].map((_, idx) => oldShape.map(row => row[idx]).reverse());
        this.piece.shape = rotated;
        if (this.collision()) {
            this.piece.shape = oldShape;
        }
        this.draw();
    }

    hardDrop() {
        if (this.gameOver) return;
        while (!this.collision()) {
            this.piece.y++;
        }
        this.piece.y--;
        this.merge();
    }

    startLoop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isActive = true;
        this.initControls();
        const loop = () => {
            if (!this.isActive || this.gameOver) return;
            this.move(0, 1);
            this.intervalId = setTimeout(loop, this.dropInterval);
        };
        this.intervalId = setTimeout(loop, this.dropInterval);
    }

    stopLoop() {
        this.isActive = false;
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        if (keyHandlers[this.playerId]) {
            window.removeEventListener('keydown', keyHandlers[this.playerId]);
            delete keyHandlers[this.playerId];
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (this.board[row][col] !== 0) {
                    this.ctx.fillStyle = this.board[row][col];
                    this.ctx.fillRect(col*this.cellSize, row*this.cellSize, this.cellSize-1, this.cellSize-1);
                } else {
                    this.ctx.fillStyle = '#0f1422';
                    this.ctx.fillRect(col*this.cellSize, row*this.cellSize, this.cellSize-1, this.cellSize-1);
                }
            }
        }
        if (this.piece) {
            for (let y = 0; y < this.piece.shape.length; y++) {
                for (let x = 0; x < this.piece.shape[y].length; x++) {
                    if (this.piece.shape[y][x]) {
                        this.ctx.fillStyle = this.piece.color;
                        this.ctx.fillRect((this.piece.x+x)*this.cellSize, (this.piece.y+y)*this.cellSize, this.cellSize-1, this.cellSize-1);
                    }
                }
            }
        }
    }

    reset() {
        this.stopLoop();
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.score = 0;
        this.lines = 0;
        this.gameOver = false;
        this.onUpdateStats(0,0);
        this.spawnPiece();
        this.startLoop();
        this.draw();
    }
}

async function createRoom() {
    myName = playerNameInput.value.trim().toUpperCase();
    if (!myName) {
        alert("DIGITE SEU NOME!");
        return;
    }
    gameMode = gameModeSelect.value;
    const modeMap = { solo: 1, '2players': 2, '3players': 3, '4players': 4 };
    totalPlayers = modeMap[gameMode] || 2;
    myPlayerId = "player1";
    const newRoom = db.ref("rooms").push();
    roomId = newRoom.key;
    const players = {};
    for (let i = 1; i <= totalPlayers; i++) {
        players[`player${i}`] = {
            name: i === 1 ? myName : "---",
            lines: 0,
            score: 0,
            gameOver: false,
            disconnected: false
        };
    }
    await newRoom.set({
        players: players,
        started: false,
        gameOver: false,
        mode: gameMode,
        totalPlayers: totalPlayers,
        winner: null,
        ranking: [],
        createdAt: Date.now()
    });
    startGame();
}

async function joinRoom(id) {
    myName = prompt("DIGITE SEU NOME:").toUpperCase();
    if (!myName) {
        window.location.href = window.location.pathname;
        return;
    }
    const ref = db.ref("rooms/" + id);
    const snap = await ref.get();
    const data = snap.val();
    if (!data) {
        alert("SALA NÃO ENCONTRADA!");
        window.location.href = window.location.pathname;
        return;
    }
    let playerSlot = null;
    for (let i = 1; i <= data.totalPlayers; i++) {
        if (data.players[`player${i}`].name === "---") {
            playerSlot = `player${i}`;
            break;
        }
    }
    if (!playerSlot) {
        alert("SALA CHEIA!");
        window.location.href = window.location.pathname;
        return;
    }
    myPlayerId = playerSlot;
    roomId = id;
    gameMode = data.mode;
    totalPlayers = data.totalPlayers;
    await ref.child(`players/${playerSlot}`).update({
        name: myName,
        lines: 0,
        score: 0,
        gameOver: false,
        disconnected: false
    });
    startGame();
}

function startGame() {
    roomCodeSpan.innerText = `SALA: ${roomId}`;
    roomInfoDiv.style.display = "flex";
    lobbyDiv.style.display = "none";
    gameAreaDiv.style.display = "block";
    updateGameUI();
    setupTouchControls();

    if (totalPlayers === 1) {
        waitingMsg.style.display = "none";
        playersListDiv.style.display = "none";
    } else {
        waitingMsg.style.display = "block";
        playersListDiv.style.display = "block";
    }

    gameRef = db.ref("rooms/" + roomId);
    gameRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        updatePlayerUI(data);
        updatePlayersList(data);
        playersCountSpan.innerText = `${countPlayers(data)}/${data.totalPlayers}`;

        const filled = countPlayers(data);
        if (filled === data.totalPlayers && !data.started) {
            gameRef.update({ started: true });
        }

        if (data.started && !gameStarted) {
            initAllTetris(data);
            gameStarted = true;
            waitingMsg.style.display = "none";
            playersListDiv.style.display = "none";
        }

        if (data.started && gameStarted) {
            checkGameOver(data);
        }
    });
}

function countPlayers(data) {
    let count = 0;
    for (let i = 1; i <= data.totalPlayers; i++) {
        if (data.players[`player${i}`].name !== "---") count++;
    }
    return count;
}

function updatePlayerUI(data) {
    for (let i = 1; i <= data.totalPlayers; i++) {
        const player = data.players[`player${i}`];
        const nameSpan = document.getElementById(`p${i}-name`);
        const linesSpan = document.getElementById(`p${i}-lines`);
        const scoreSpan = document.getElementById(`p${i}-score`);
        const statusSpan = document.getElementById(`p${i}-status`);
        if (nameSpan) nameSpan.innerText = player.name;
        if (linesSpan) linesSpan.innerText = player.lines;
        if (scoreSpan) scoreSpan.innerText = player.score;
        if (statusSpan) statusSpan.innerText = player.gameOver ? "🔴" : player.disconnected ? "⚫" : "🟢";
    }
}

function updatePlayersList(data) {
    if (totalPlayers === 1) {
        playersListDiv.style.display = "none";
        return;
    }
    let html = "<div style='color:#88ccff;margin-top:10px;'>JOGADORES NA SALA:</div>";
    for (let i = 1; i <= data.totalPlayers; i++) {
        const player = data.players[`player${i}`];
        const status = player.gameOver ? "🔴" : player.disconnected ? "⚫" : "🟢";
        html += `<div style="color:#ffcc33;padding:5px;">${status} ${player.name} ${player.name === "---" ? "👤" : ""}</div>`;
    }
    playersListDiv.innerHTML = html;
    playersListDiv.style.display = "block";
}

function updateGameUI() {
    const modeNames = { solo: "SOLO", '2players': "2 JOGADORES", '3players': "3 JOGADORES", '4players': "4 JOGADORES" };
    vsDivider.innerText = gameMode === "solo" ? "SOLO" : "VS";
    for (let i = 1; i <= 4; i++) {
        const panel = document.getElementById(`panel-p${i}`);
        if (panel) {
            panel.style.display = i <= totalPlayers ? "block" : "none";
        }
        const wrapper = document.getElementById(`board${i}`)?.parentElement;
        if (wrapper) {
            wrapper.style.display = i <= totalPlayers ? "block" : "none";
        }
    }
    const controlTexts = {
        '2players': 'JOGADOR 1: ← → ↓ | ↑ GIRAR | ESPAÇO QUEDA | JOGADOR 2: A S D | W GIRAR | Q QUEDA',
        '3players': 'P1: ← → ↓ | ↑ | ESPAÇO | P2: A S D | W | Q | P3: J K L | I | U',
        '4players': 'P1: ← → ↓ | ↑ | ESPAÇO | P2: A S D | W | Q | P3: J K L | I | U | P4: F G H | R | T'
    };
    controlsText.innerText = controlTexts[gameMode] || controlTexts['2players'];
}

function initAllTetris(data) {
    for (const key in tetrisGames) {
        tetrisGames[key].stopLoop();
        delete tetrisGames[key];
    }
    for (let i = 1; i <= totalPlayers; i++) {
        const playerId = `player${i}`;
        const canvasId = `board${i}`;
        tetrisGames[playerId] = new TetrisGame(
            canvasId,
            (lines, score) => updateStats(playerId, lines, score),
            () => gameOver(playerId),
            playerId,
            i
        );
    }
}

async function updateStats(player, lines, score) {
    if (!roomId) return;
    await gameRef.child(`players/${player}`).update({ lines, score });
}

async function gameOver(loser) {
    await gameRef.child(`players/${loser}`).update({ gameOver: true });
}

function checkGameOver(data) {
    let allGameOver = true;
    let activePlayers = 0;
    for (let i = 1; i <= totalPlayers; i++) {
        const player = data.players[`player${i}`];
        if (player.name !== "---") {
            if (!player.gameOver) {
                allGameOver = false;
                activePlayers++;
            }
        }
    }
    if (allGameOver && activePlayers === 0) {
        for (const key in tetrisGames) {
            tetrisGames[key].stopLoop();
        }
        const ranking = [];
        for (let i = 1; i <= totalPlayers; i++) {
            const player = data.players[`player${i}`];
            if (player.name !== "---") {
                ranking.push({
                    name: player.name,
                    score: player.score,
                    lines: player.lines,
                    gameOver: player.gameOver
                });
            }
        }
        ranking.sort((a, b) => b.score - a.score);
        const winner = ranking[0];
        const loser = ranking[ranking.length - 1];
        let message = "";
        if (ranking.length === 1) {
            message = `${winner.name} GANHOU SOZINHO! 🏆`;
        } else if (ranking.every(p => p.gameOver)) {
            if (winner.score === loser.score) {
                message = `EMPATE! ${winner.name} e ${loser.name} empataram! 🤝`;
            } else {
                message = `${winner.name} GANHOU! 🏆\n${loser.name} PERDEU! 💀`;
            }
        }
        winnerMsgSpan.innerText = message;
        let rankingHtml = "<h3>🏆 RANKING FINAL</h3>";
        ranking.forEach((p, idx) => {
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx+1}º`;
            rankingHtml += `<div style="padding:5px;color:#88ccff;">${medal} ${p.name} - SCORE: ${p.score} | LINES: ${p.lines}</div>`;
        });
        rankingDisplay.innerHTML = rankingHtml;
        gameRef.update({
            ranking: ranking,
            winner: winner.name,
            gameOver: true
        });
        overlay.classList.add("show");
    }
}

async function restartGame() {
    if (!roomId) return;
    const snap = await gameRef.get();
    const data = snap.val();
    if (!data) return;
    overlay.classList.remove("show");
    rankingDisplay.innerHTML = "";
    const players = {};
    for (let i = 1; i <= totalPlayers; i++) {
        const playerData = data.players[`player${i}`];
        players[`player${i}`] = {
            name: playerData.name,
            lines: 0,
            score: 0,
            gameOver: false,
            disconnected: false
        };
    }
    await gameRef.update({
        players: players,
        started: true,
        gameOver: false,
        winner: null,
        ranking: []
    });
    for (const key in tetrisGames) {
        tetrisGames[key].stopLoop();
        tetrisGames[key].reset();
    }
    gameStarted = true;
}

function shareRoom() {
    if (!roomId) return;
    const link = window.location.origin + window.location.pathname + "?room=" + roomId;
    navigator.clipboard.writeText(link);
    alert("LINK COPIADO! Compartilhe com seus amigos!");
}

function exitGame() {
    if (confirm("Tem certeza que quer sair?")) {
        if (roomId && myPlayerId) {
            gameRef.child(`players/${myPlayerId}`).update({ disconnected: true });
            gameRef.child(`players/${myPlayerId}`).update({ name: "---" });
        }
        window.location.href = window.location.pathname;
    }
}

function setupTouchControls() {
    const buttons = document.querySelectorAll('.touch-btn');
    buttons.forEach(btn => {
        const handler = (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const game = tetrisGames[myPlayerId];
            if (!game || game.gameOver) return;
            switch(action) {
                case 'left': game.move(-1, 0); break;
                case 'right': game.move(1, 0); break;
                case 'down': game.move(0, 1); break;
                case 'rotate': game.rotate(); break;
                case 'drop': game.hardDrop(); break;
            }
        };
        btn.addEventListener('pointerdown', handler);
    });
}

createBtn.onclick = createRoom;
shareBtn.onclick = shareRoom;
resetBtn.onclick = restartGame;
exitBtn.onclick = exitGame;
closeOverlayBtn.onclick = () => {
    overlay.classList.remove("show");
};
