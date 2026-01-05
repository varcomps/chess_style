import { initNetwork, createGame, joinGame, sendNetworkMessage } from './network.js';
import { gameState } from './state.js';
import { initBackground } from './background.js';
import { recalcBoard, updateUI, render, closeModal, showToast, showPromotionModal } from './ui.js';
import { onSidebarPointerDown, activateApogee, recruitPawn, useForge, finishPromotion } from './game.js';

// --- Global Assignments for HTML onclick access ---
window.createGame = createGame;
window.joinGame = joinGame;
window.sendNetworkMessage = sendNetworkMessage;
window.closeModal = closeModal;
window.activateApogee = activateApogee;
window.recruitPawn = recruitPawn;
window.useForge = useForge;
window.onSidebarPointerDown = onSidebarPointerDown;
window.finishPromotion = finishPromotion;

window.toggleBuildMode = function(forceState) {
    if (typeof forceState !== 'undefined') gameState.isBuildMode = forceState;
    else gameState.isBuildMode = !gameState.isBuildMode;
    updateUI(); recalcBoard(); render();
}

window.switchTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-btn-${tab}`).classList.add('active');
    document.querySelectorAll('.build-group').forEach(g => g.classList.remove('active'));
    document.querySelector(`.group-${tab}`).classList.add('active');
}

// --- Init Logic ---
window.addEventListener('resize', recalcBoard);
window.addEventListener('load', () => {
    initNetwork();
    initBackground();
    recalcBoard();
});

// --- Gestures ---
(function initGestures() {
    let touchStartY = 0;
    let touchEndY = 0;
    const MIN_SWIPE_DISTANCE = 50;
    const swipeZone = document.getElementById('swipe-zone');
    
    if(swipeZone) {
        swipeZone.addEventListener('touchstart', e => { touchStartY = e.changedTouches[0].screenY; }, {passive: true});
        swipeZone.addEventListener('touchend', e => {
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, {passive: true});
    }

    document.addEventListener('touchstart', e => {
        if (!gameState.isBuildMode) return;
        touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    document.addEventListener('touchend', e => {
        if (!gameState.isBuildMode) return;
        touchEndY = e.changedTouches[0].screenY;
        handleCloseSwipe(e);
    }, {passive: false});

    function handleSwipe() {
        if (touchStartY - touchEndY > MIN_SWIPE_DISTANCE) {
            if (!gameState.isBuildMode) window.toggleBuildMode(true);
        }
    }

    function handleCloseSwipe(e) {
            if (touchEndY - touchStartY > MIN_SWIPE_DISTANCE) {
                const buildList = document.getElementById('build-list');
                if (buildList && buildList.contains(e.target)) {
                    if (buildList.scrollTop > 5) return;
                }
                if (gameState.isBuildMode) window.toggleBuildMode(false);
            }
    }
})();

// Tooltip logic
const tooltipEl = document.getElementById('ui-tooltip');
document.querySelectorAll('.build-item').forEach(item => {
    item.addEventListener('mouseenter', e => showTooltip(e, item));
    item.addEventListener('mousemove', moveTooltip);
    item.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
    item.addEventListener('touchstart', (e) => {
        showTooltip(e.touches[0], item, true);
        setTimeout(() => tooltipEl.style.display = 'none', 4000);
    }, {passive: true});
});

function showTooltip(e, item, isTouch = false) {
    const label = item.getAttribute('data-label');
    const cost = item.getAttribute('data-cost');
    const desc = item.getAttribute('data-desc') || '';
    
    if(label) {
        tooltipEl.style.display = 'block';
        tooltipEl.innerHTML = `
            <strong style="color:var(--accent); font-size:1.1em;">${label}</strong><br>
            <span style="color:#ddd; font-weight:bold;">${cost}</span>
            ${desc ? `<div style="margin-top:5px; color:#aaa; font-style:italic; font-size:0.9em; border-top:1px solid #444; padding-top:4px;">${desc}</div>` : ''}
        `;
        if (!isTouch) moveTooltip(e); 
    }
}

function moveTooltip(e) {
    if (window.innerWidth > 768) {
        const x = e.clientX || e.pageX;
        const y = e.clientY || e.pageY;
        tooltipEl.style.left = (x + 15) + 'px';
        tooltipEl.style.top = (y - 50) + 'px'; 
    }
}

window.onkeydown = (e) => {
    if ((e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'и')) window.toggleBuildMode();
};