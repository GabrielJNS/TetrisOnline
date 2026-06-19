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

const db = firebase.database();

const lobbyDiv = document.getElementById("lobby");
const gameAreaDiv = document.getElementById("game-area");
const createBtn = document.getElementById("create-room");
const shareBtn = document.getElementById("share-room");
const resetBtn = document.getElementById("reset-game");
const playerNameInput = document.getElementById("player-name");
const roomCodeSpan = document.getElementById("room-code");
const waitingMsg = document.getElementById("waiting-msg");
const roomInfoDiv = document.getElementById("room-info");

const p1NameSpan = document.getElementById("p1-name");
const p2NameSpan = document.getElementById("p2-name");
const p1LinesSpan = document.getElementById("p1-lines");
const p1ScoreSpan = document.getElementById("p1-score");
const p2LinesSpan = document.getElementById("p2-lines");
const p2ScoreSpan = document.getElementById("p2-score");
const p1Status = document.getElementById("p1-status");
const p2Status = document.getElementById("p2-status");

const overlay = document.getElementById("victory-overlay");
const winnerMsgSpan = document.getElementById("winner-message");
const closeOverlayBtn = document.getElementById("close-overlay");

let roomId = null;
let myPlayerId = null;
let gameRef = null;
let tetris1 = null;
let tetris2 = null;
let gameStarted = false;
let myName = "";
let keyHandler = null;
let firebaseReady = false;

firebase.auth().signInAnonymously().then(() => {
    firebaseReady = true;
    const roomParam = new URLSearchParams(location.search).get("room");
    if (roomParam && !sessionStorage.getItem("joined")) {
        sessionStorage.setItem("joined", "true");
        joinRoom(roomParam);
    }
});

class TetrisGame {
    constructor(canvasId, onUpdateStats, onGameOverCallback) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onUpdateStats = onUpdateStats;
        this.onGameOverCallback = onGameOverCallback;

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
        this.startLoop();
    }

    initControls() {
        if (keyHandler) {
            window.removeEventListener('keydown', keyHandler);
        }
        
        keyHandler = (e) => {
            if (this.gameOver || !this.isActive) return;
            const key = e.key;
            if (key === 'ArrowLeft') this.move(-1, 0);
            else if (key === 'ArrowRight') this.move(1, 0);
            else if (key === 'ArrowDown') this.move(0, 1);
            else if (key === 'ArrowUp') this.rotate();
            else if (key === ' ') {
                e.preventDefault();
                this.hardDrop();
            }
        };
        window.addEventListener('keydown', keyHandler);
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
        this.intervalId = setInterval(() => {
            if (!this.gameOver && this.isActive) {
                this.move(0, 1);
            }
        }, 420);
        this.initControls();
    }

    stopLoop() {
        this.isActive = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (keyHandler) {
            window.removeEventListener('keydown', keyHandler);
            keyHandler = null;
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
    }
}

async function createRoom() {
    if (!firebaseReady) {
        alert("Aguardando conexão com Firebase...");
        return;
    }
    myName = playerNameInput.value.trim().toUpperCase();
    if (!myName) {
        alert("DIGITE SEU NOME!");
        return;
    }
    myPlayerId = "player1";
    const newRoom = db.ref("rooms").push();
    roomId = newRoom.key;
    await newRoom.set({
        players: {
            player1: { name: myName, lines: 0, score: 0, gameOver: false },
            player2: { name: "---", lines: 0, score: 0, gameOver: false }
        },
        started: false
    });
    startGame();
}

async function joinRoom(roomIdFromUrl) {
    if (!firebaseReady) {
        setTimeout(() => joinRoom(roomIdFromUrl), 500);
        return;
    }
    myName = prompt("DIGITE SEU NOME:").toUpperCase();
    if (!myName) {
        window.location.href = window.location.pathname;
        return;
    }
    const roomRef = db.ref("rooms/" + roomIdFromUrl);
    const snap = await roomRef.get();
    const data = snap.val();
    if (!data) {
        alert("SALA NÃO ENCONTRADA!");
        window.location.href = window.location.pathname;
        return;
    }
    if (data.players.player2.name !== "---") {
        alert("SALA CHEIA!");
        window.location.href = window.location.pathname;
        return;
    }
    myPlayerId = "player2";
    roomId = roomIdFromUrl;
    await roomRef.child("players/player2").update({ name: myName, lines: 0, score: 0, gameOver: false });
    startGame();
}

async function startGame() {
    roomCodeSpan.innerText = `SALA: ${roomId}`;
    waitingMsg.style.display = "block";
    roomInfoDiv.style.display = "flex";
    lobbyDiv.style.display = "none";
    gameAreaDiv.style.display = "block";

    gameRef = db.ref("rooms/" + roomId);
    gameRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        p1NameSpan.innerText = data.players.player1.name;
        p2NameSpan.innerText = data.players.player2.name;
        p1LinesSpan.innerText = data.players.player1.lines;
        p1ScoreSpan.innerText = data.players.player1.score;
        p2LinesSpan.innerText = data.players.player2.lines;
        p2ScoreSpan.innerText = data.players.player2.score;
        p1Status.innerText = data.players.player1.gameOver ? "🔴" : "🟢";
        p2Status.innerText = data.players.player2.gameOver ? "🔴" : "🟢";

        if (data.players.player2.name !== "---" && !data.started) {
            gameRef.update({ started: true });
        }

        if (data.started && !gameStarted) {
            initTetris();
            gameStarted = true;
            waitingMsg.style.display = "none";
        }

        if (data.started && gameStarted) {
            const p1GameOver = data.players.player1.gameOver;
            const p2GameOver = data.players.player2.gameOver;
            
            if (p1GameOver || p2GameOver) {
                if (tetris1) tetris1.stopLoop();
                if (tetris2) tetris2.stopLoop();
                
                if (!p1GameOver && p2GameOver) {
                    winnerMsgSpan.innerText = `${data.players.player1.name} VENCEU! 🏆`;
                    overlay.classList.add("show");
                } else if (p1GameOver && !p2GameOver) {
                    winnerMsgSpan.innerText = `${data.players.player2.name} VENCEU! 🏆`;
                    overlay.classList.add("show");
                } else if (p1GameOver && p2GameOver) {
                    winnerMsgSpan.innerText = `EMPATE! 🤝`;
                    overlay.classList.add("show");
                }
            }
        }
    });
}

function initTetris() {
    if (tetris1) {
        tetris1.stopLoop();
        tetris1.reset();
    }
    if (tetris2) {
        tetris2.stopLoop();
        tetris2.reset();
    }
    
    tetris1 = new TetrisGame("board1", (lines, score) => updateStats("player1", lines, score), () => gameOver("player1"));
    tetris2 = new TetrisGame("board2", (lines, score) => updateStats("player2", lines, score), () => gameOver("player2"));
}

async function updateStats(player, lines, score) {
    if (!roomId) return;
    await gameRef.child(`players/${player}`).update({ lines, score });
}

async function gameOver(loser) {
    await gameRef.child(`players/${loser}`).update({ gameOver: true });
}

async function restartGame() {
    if (!roomId) return;
    const snap = await gameRef.get();
    const data = snap.val();
    if (!data) return;
    
    overlay.classList.remove("show");
    
    await gameRef.update({
        players: {
            player1: { name: data.players.player1.name, lines: 0, score: 0, gameOver: false },
            player2: { name: data.players.player2.name, lines: 0, score: 0, gameOver: false }
        },
        started: true
    });
    
    if (tetris1) {
        tetris1.stopLoop();
        tetris1.reset();
    }
    if (tetris2) {
        tetris2.stopLoop();
        tetris2.reset();
    }
    gameStarted = true;
}

function shareRoom() {
    if (!roomId) return;
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert("LINK COPIADO!");
}

createBtn.onclick = createRoom;
shareBtn.onclick = shareRoom;
resetBtn.onclick = restartGame;
closeOverlayBtn.onclick = () => {
    overlay.classList.remove("show");
};

window.onload = function() {
    const roomParam = new URLSearchParams(location.search).get("room");
    if (!roomParam && !sessionStorage.getItem("reloaded")) {
        sessionStorage.setItem("reloaded", "true");
        location.reload();
    } else if (!roomParam) {
        sessionStorage.removeItem("reloaded");
    }
};
