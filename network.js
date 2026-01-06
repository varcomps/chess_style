import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { gameState } from './state.js';
import { showToast, updateUI, render } from './ui.js';
import { initBoard, handleData } from './game.js';

const firebaseConfig = {
    apiKey: "AIzaSyAN-w6PnAnTBxpBrgEd7Xt8ChNmBKL3AVk",
    authDomain: "chessalio.firebaseapp.com",
    projectId: "chessalio",
    storageBucket: "chessalio.firebasestorage.app",
    messagingSenderId: "405155447838",
    appId: "1:405155447838:web:b6629a43f3bd35a38fda0f",
    measurementId: "G-5QBXY2QRWF"
};

export function initNetwork() {
    try {
        const app = initializeApp(firebaseConfig);
        gameState.db = getDatabase(app);
    } catch(e) {
        showToast("Ошибка Firebase! Проверьте конфиг.");
        console.error(e);
    }
}

export function createGame() {
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('room-code').value = roomCode;
    gameState.currentRoom = roomCode;
    gameState.myColor = 'w';
    document.getElementById('status').innerText = `КОМНАТА: ${roomCode}`;
    
    // --- КОПИРОВАНИЕ В БУФЕР ---
    if (navigator.clipboard) {
        navigator.clipboard.writeText(roomCode).then(() => {
            showToast(`КОД ${roomCode} СКОПИРОВАН!`);
        }).catch(err => {
            console.error('Ошибка копирования:', err);
            showToast(`Комната ${roomCode} создана.`);
        });
    } else {
        showToast(`Комната ${roomCode} создана.`);
    }

    gameState.gameRef = ref(gameState.db, 'games/' + roomCode);
    set(gameState.gameRef, { status: 'waiting', white_present: true, last_move: null }).then(() => {
        onDisconnect(gameState.gameRef).remove();
        waitForOpponent();
    }).catch((error) => { showToast("Ошибка БД! " + error.message); console.error(error); });
}

export function joinGame() {
    const roomCode = document.getElementById('room-code').value.trim();
    if (roomCode.length !== 6) return showToast("Введите 6-значный код!");
    gameState.currentRoom = roomCode;
    gameState.myColor = 'b';
    showToast(`Подключение...`);
    gameState.gameRef = ref(gameState.db, 'games/' + roomCode);
    set(ref(gameState.db, 'games/' + roomCode + '/status'), 'playing')
        .then(() => {
            showToast("Успешное подключение!");
            setupGameListener();
            document.getElementById('connection-overlay').classList.add('hidden');
            initBoard();
            updateUI();
        })
        .catch((error) => { showToast("Ошибка: Комната не найдена."); });
}

export function waitForOpponent() {
    const statusRef = ref(gameState.db, 'games/' + gameState.currentRoom + '/status');
    onValue(statusRef, (snapshot) => {
        if (snapshot.val() === 'playing') {
            showToast("ПРОТИВНИК НАЙДЕН!");
            document.getElementById('connection-overlay').classList.add('hidden');
            setupGameListener();
            initBoard();
            updateUI();
        }
    });
}

export function setupGameListener() {
    const moveRef = ref(gameState.db, 'games/' + gameState.currentRoom + '/last_move');
    onValue(moveRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.senderColor !== gameState.myColor) handleData(data);
    });
}

export function sendNetworkMessage(data) {
    if (!gameState.gameRef) return;
    data.senderColor = gameState.myColor;
    set(ref(gameState.db, 'games/' + gameState.currentRoom + '/last_move'), data);
}