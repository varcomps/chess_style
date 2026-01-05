import { gameState } from './state.js';
import { BUILDING_COSTS, BUILDING_LIMITS, FORTRESS_HP, BUILDINGS, PIECE_URLS, BUILDING_ICONS } from './constants.js';
import { sendNetworkMessage } from './network.js';
import { updateUI, render, recalcBoard, showToast, hasSpecial, isFog, isUpgradedUnit, openAcademyModal, closeModal, showPromotionModal, endGame, initDrag, dragState } from './ui.js';

export function initBoard() {
    gameState.playerColor = gameState.myColor;
    gameState.board = Array(8).fill(null).map(() => Array(8).fill(null));
    const layout = ['r','n','b','q','k','b','n','r'];
    for(let i=0; i<8; i++) {
        gameState.board[0][i] = { type: layout[i], color: 'b', moved: false, armor: 0 };
        gameState.board[1][i] = { type: 'p', color: 'b', moved: false, armor: 0 };
        gameState.board[6][i] = { type: 'p', color: 'w', moved: false, armor: 0 };
        gameState.board[7][i] = { type: layout[i], color: 'w', moved: false, armor: 0 };
    }
    gameState.actionsLeft = (gameState.playerColor === 'w') ? 1 : 0; 
    recalcBoard(); render();
}

export function handleData(d) {
    const oppColor = (gameState.playerColor === 'w' ? 'b' : 'w');
    if (d.type === 'move') {
        let movingPiece = gameState.board[d.from.r][d.from.c];
        if (!movingPiece) movingPiece = { type: 'p', color: oppColor }; 
        if (movingPiece && movingPiece.onForge) gameState.board[d.from.r][d.from.c] = { type: 'forge', color: movingPiece.color };
        else gameState.board[d.from.r][d.from.c] = null;
        if (d.onForgeEnter) {
                movingPiece.onForge = true; movingPiece.moved = true;
                if (d.promoteTo) movingPiece.type = d.promoteTo; 
                gameState.board[d.to.r][d.to.c] = movingPiece;
        } else {
                movingPiece.moved = true;
                if (d.promoteTo) movingPiece.type = d.promoteTo;
                gameState.board[d.to.r][d.to.c] = movingPiece;
        }
        if (d.win) endGame(false);
    } else if (d.type === 'attack_hit') {
        if (gameState.board[d.r][d.c]) gameState.board[d.r][d.c].hp = d.hp;
    } else if (d.type === 'attack_armor') {
        if (gameState.board[d.r][d.c]) gameState.board[d.r][d.c].armor = d.armor;
    } else if (d.type === 'forge_armor') {
        if (gameState.board[d.r][d.c]) gameState.board[d.r][d.c].armor = (gameState.board[d.r][d.c].armor || 0) + 1;
    } else if (d.type === 'transform') {
        if (gameState.board[d.from.r][d.from.c] && gameState.board[d.from.r][d.from.c].type === 'p') gameState.board[d.from.r][d.from.c] = null;
        gameState.board[d.to.r][d.to.c] = { type: d.newType, color: oppColor, moved: true, armor: 0 };
    } else if (d.type === 'build') {
        let obj = { type: d.buildType, color: oppColor };
        if (d.buildType === 'fortress') obj.hp = FORTRESS_HP['fortress'];
        gameState.board[d.r][d.c] = obj;
    } else if (d.type === 'upgrade') {
        if(gameState.board[d.r][d.c]) {
            gameState.board[d.r][d.c].type = d.newType;
            if (d.newType.startsWith('fortress')) gameState.board[d.r][d.c].hp = FORTRESS_HP[d.newType];
        }
    } else if (d.type === 'demolish') {
        if (gameState.board[d.r][d.c] && gameState.board[d.r][d.c].onForge) gameState.board[d.r][d.c].onForge = false;
        else gameState.board[d.r][d.c] = null;
    } else if (d.type === 'apogee_trigger') {
        playSlashAnimation();
        setTimeout(() => triggerExpansion(), 600); // Wait for slash
    }
    if (d.isLast) turnEndLogic();
    render(); updateUI();
}

function playSlashAnimation() {
    const overlay = document.getElementById('slash-overlay');
    overlay.classList.add('active');
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 1000);
}

export function turnEndLogic() {
    gameState.actionsLeft = hasSpecial(gameState.playerColor, 'hq') ? 2 : 1; 
    gameState.board.flat().forEach(p => { if (p) p.freeMoveUsed = false; });
    collectResources();
}

export function collectResources() {
    let produced = { w:0, s:0, m:0, c:0, p:0, f:0, g:0, cl:0, poly:0 };
    for(let r=0; r<gameState.rows; r++) {
        for(let c=0; c<gameState.cols; c++) {
            const p = gameState.board[r][c];
            if (p && p.color === gameState.playerColor) {
                if (p.type === 'mine') { if (gameState.myResources.stone < 5) produced.s++; }
                if (p.type === 'mine_t2') { if (gameState.myResources.stone < 5) produced.s++; if (gameState.myResources.metal < 5) produced.m++; }
                if (p.type === 'mine_t3') { if (gameState.myResources.stone < 5) produced.s++; if (gameState.myResources.metal < 5) produced.m++; if (gameState.myResources.gem < 5) produced.g++; }
                if (p.type === 'lumber') { if (gameState.myResources.wood < 5) produced.w++; }
                if (p.type === 'lumber_t2') { if (gameState.myResources.wood < 5) produced.w++; if (gameState.myResources.cedar < 5) produced.c++; }
                if (p.type === 'lumber_t3') { if (gameState.myResources.wood < 5) produced.w++; if (gameState.myResources.cedar < 5) produced.c++; if (gameState.myResources.polymer < 5) produced.poly++; }
                if (p.type === 'furnace') { if (gameState.myResources.cedar > 0 && gameState.myResources.coal < 5) { gameState.myResources.cedar--; produced.cl++; }}
                if (p.type === 'farm') { if (gameState.myResources.food < 5) produced.f++; }
                if (p.type === 'papermill') { if (gameState.myResources.wood > 0 && gameState.myResources.paper < 5) { gameState.myResources.wood--; produced.p++; }}
            }
        }
    }
    gameState.myResources.wood = Math.min(5, gameState.myResources.wood + produced.w);
    gameState.myResources.stone = Math.min(5, gameState.myResources.stone + produced.s);
    gameState.myResources.metal = Math.min(5, gameState.myResources.metal + produced.m);
    gameState.myResources.cedar = Math.min(5, gameState.myResources.cedar + produced.c);
    gameState.myResources.paper = Math.min(5, gameState.myResources.paper + produced.p);
    gameState.myResources.food = Math.min(5, gameState.myResources.food + produced.f);
    gameState.myResources.gem = Math.min(5, gameState.myResources.gem + produced.g);
    gameState.myResources.coal = Math.min(5, gameState.myResources.coal + produced.cl);
    gameState.myResources.polymer = Math.min(5, gameState.myResources.polymer + produced.poly);
}

export function buildSomething(r, c, type) {
    let apCost = 2;
    if (type === 'lumber' || type === 'mine' || type === 'demolish' || type === 'hq') apCost = 1;

    if (type === 'demolish') {
        const target = gameState.board[r][c];
        if (!target || target.color !== gameState.playerColor) { showToast("НЕЛЬЗЯ СНОСИТЬ."); return; }
        const isBuilding = BUILDINGS.includes(target.type) || target.type === 'forge';
        if (!isBuilding && !target.onForge) return showToast("НЕЛЬЗЯ СНОСИТЬ ЮНИТОВ!");
        if (gameState.actionsLeft < apCost) { showToast(`НУЖНО ${apCost} ОД.`); return; }
        if (target.onForge) target.onForge = false;
        else gameState.board[r][c] = null;
        gameState.actionsLeft -= apCost;
        sendNetworkMessage({ type: 'demolish', r, c, isLast: (gameState.actionsLeft<=0) });
        updateUI(); render();
        return;
    }

    const costs = BUILDING_COSTS[type];
    
    if (type.endsWith('_t2') || type.endsWith('_t3') || type === 'academy') {
        let baseType = '';
        let requiredType = '';
        
        if (type === 'academy') {
            requiredType = 'camp';
        } else if (type === 'academy_t2') { 
            requiredType = 'academy';
        } else if (type.endsWith('_t2')) {
            baseType = type.replace('_t2', '');
            requiredType = baseType; 
        } else {
            baseType = type.replace('_t3', '');
            requiredType = baseType + '_t2'; 
        }
        
        const target = gameState.board[r][c];
        if (!target || target.type !== requiredType || target.color !== gameState.playerColor) {
            showToast(`СТАВИТЬ ТОЛЬКО НА ${requiredType}!`);
            return;
        }
        if (gameState.actionsLeft < apCost) return showToast(`НУЖНО ${apCost} ОД.`);
        if (!checkResources(costs)) return;
        
        payResources(costs);
        gameState.board[r][c].type = type;
        if (type.startsWith('fortress')) gameState.board[r][c].hp = FORTRESS_HP[type];
        
        gameState.actionsLeft -= apCost;
        sendNetworkMessage({ type: 'upgrade', r, c, newType: type, isLast: (gameState.actionsLeft<=0) });
        updateUI(); render();
        return;
    }

    if (gameState.board[r][c]) return; 
    if (gameState.actionsLeft < apCost) return showToast(`НУЖНО ${apCost} ОД.`);
    
    if (BUILDING_LIMITS[type] && getBuildingCount(type) >= BUILDING_LIMITS[type]) {
        showToast(`ЛИМИТ ПОСТРОЕК (${type})!`);
        return;
    }

    if (!checkResources(costs)) return;

    payResources(costs);
    gameState.actionsLeft -= apCost;
    let newObj = { type: type, color: gameState.playerColor };
    if (type === 'fortress') newObj.hp = FORTRESS_HP['fortress'];
    gameState.board[r][c] = newObj;
    sendNetworkMessage({ type: 'build', r, c, buildType: type, isLast: (gameState.actionsLeft<=0) });
    updateUI(); render(); 
}

function getBuildingCount(baseType) {
    let count = 0;
    gameState.board.flat().forEach(p => {
        if (p && p.color === gameState.playerColor) {
            const t = p.type;
            if (t === baseType || t.startsWith(baseType + '_')) count++;
            if (baseType === 'forge' && p.onForge) count++;
        }
    });
    return count;
}

function checkResources(cost) {
    if (gameState.myResources.wood < cost.wood || gameState.myResources.stone < cost.stone || 
        gameState.myResources.metal < cost.metal || gameState.myResources.cedar < cost.cedar ||
        gameState.myResources.paper < cost.paper || gameState.myResources.gem < cost.gem || 
        gameState.myResources.coal < cost.coal || gameState.myResources.polymer < cost.polymer) {
        showToast(`НЕ ХВАТАЕТ РЕСУРСОВ!`);
        return false;
    }
    return true;
}

function payResources(cost) {
    gameState.myResources.wood -= cost.wood;
    gameState.myResources.stone -= cost.stone;
    gameState.myResources.metal -= cost.metal;
    gameState.myResources.cedar -= cost.cedar;
    gameState.myResources.paper -= cost.paper;
    gameState.myResources.gem -= cost.gem;
    gameState.myResources.coal -= cost.coal;
    gameState.myResources.polymer -= cost.polymer;
}

export function activateApogee() {
    if (gameState.isExpanded) return;
    playSlashAnimation();
    sendNetworkMessage({ type: 'apogee_trigger' });
    setTimeout(() => triggerExpansion(), 600);
}

function triggerExpansion() {
    if (gameState.isExpanded) return;
    const newState = Array(16).fill(null).map(() => Array(8).fill(null));
    
    // SYMMETRIC LOGIC:
    // Original Board: 0-7.
    // Cut happens between 3 and 4.
    // Top Plate (Black Home): 0-3 -> Stays at 0-3.
    // Bottom Plate (White Home): 4-7 -> Moves to 12-15.
    // Fog Gap: 4-11 (8 rows).
    
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const p = gameState.board[r][c];
            if (p) {
                const isBuilding = BUILDINGS.includes(p.type) || p.type === 'forge';

                if (r < 4) {
                    // --- TOP SECTION (Originally Black Base) ---
                    // If it's a White invader (color 'w' and NOT a building) -> Glitch into Fog
                    if (p.color === 'w' && !isBuilding) {
                        // Move to lower part of Fog (rows 8-11) to avoid overlap with Black invaders
                        p.glitched = true;
                        newState[r + 8][c] = p; 
                    } else {
                        // Black pieces and buildings stay on the plate
                        newState[r][c] = p;
                    }
                } else {
                    // --- BOTTOM SECTION (Originally White Base) ---
                    // If it's a Black invader (color 'b' and NOT a building) -> Glitch into Fog
                    if (p.color === 'b' && !isBuilding) {
                        // Stay in upper part of Fog (rows 4-7)
                        p.glitched = true;
                        newState[r][c] = p;
                    } else {
                        // White pieces and buildings move with the plate
                        newState[r + 8][c] = p;
                    }
                }
            }
        }
    }
    
    gameState.board = newState; 
    gameState.rows = 16; 
    gameState.cols = 8;
    gameState.isExpanded = true;
    
    recalcBoard(); 
    render(); 
    updateUI();
    
    // Apply visual glitch effect to pieces marked as glitched
    setTimeout(() => {
        const pieces = document.querySelectorAll('.piece');
        gameState.board.flat().forEach((p, index) => {
             if (p && p.glitched) {
                 // We need to find the DOM element. 
                 // Render rebuilds DOM, so we can find by r,c calculation or just add class in render.
                 // Better: Let's re-render with the class if needed, or modify render function.
                 // For now, let's just make sure render() handles a 'glitched' property or we add it manually.
                 // Actually, let's update render() to check for p.glitched property?
                 // Easier: Modify render in this response is tricky since render is in ui.js. 
                 // Instead, let's just select them based on rows.
             }
        });
        
        // Manual DOM update for glitch effect based on rows
        const squares = document.getElementById('board').children;
        for (let r=4; r<=11; r++) {
            for (let c=0; c<8; c++) {
                const idx = (gameState.rows - 1 - r) * 8 + c; // Logic depends on perspective, but let's simplify
                // Actually, render() creates divs in order.
                // Row 0 is top if rendering logic follows standard loops.
                // The render loop in ui.js: rangeR.forEach...
            }
        }
        
        // Let's just iterate the board data and find the DOM elements
        const boardEl = document.getElementById('board');
        // Because render() wipes HTML, we should update render in ui.js OR add the class here after render.
        // Let's add the class here.
        const allSquares = Array.from(boardEl.children);
        let sqIdx = 0;
        // Re-simulate render loop to match indices
        const rangeR = gameState.playerColor === 'b' ? [...Array(16).keys()].reverse() : [...Array(16).keys()];
        const rangeC = [...Array(8).keys()];
        
        rangeR.forEach(r => {
            rangeC.forEach(c => {
                 const p = gameState.board[r][c];
                 if (p && p.glitched) {
                     const pieceEl = allSquares[sqIdx].querySelector('.piece');
                     if (pieceEl) pieceEl.classList.add('glitched-piece');
                 }
                 sqIdx++;
            });
        });
        
    }, 50);

    setTimeout(() => { gameState.expansionAnimationDone = true; }, 2000);
}

export function recruitPawn() {
    if (gameState.actionsLeft < 1) { showToast("НУЖНО 1 ОД!"); return; }
    if (gameState.myResources.food < 2) { showToast("НУЖНО 2 ЕДЫ!"); return; }
    
    let campR = -1, campC = -1;
    for(let r=0; r<gameState.rows; r++) {
        for(let c=0; c<gameState.cols; c++) {
            if(gameState.board[r][c] && gameState.board[r][c].type === 'camp' && gameState.board[r][c].color === gameState.playerColor) {
                campR = r; campC = c; break;
            }
        }
    }
    
    if (campR === -1) { showToast("НЕТ ЛАГЕРЯ!"); return; }

    const dir = gameState.playerColor === 'w' ? -1 : 1;
    const targetR = campR + dir;
    
    if (targetR < 0 || targetR >= gameState.rows || gameState.board[targetR][campC]) {
        showToast("МЕСТО ВЫСАДКИ ЗАНЯТО!");
        return;
    }
    
    gameState.myResources.food -= 2;
    gameState.actionsLeft--;
    gameState.board[targetR][campC] = { type: 'p', color: gameState.playerColor, moved: true, armor: 0 };
    sendNetworkMessage({ type: 'transform', from: {r: campR, c: campC}, to: {r: targetR, c: campC}, newType: 'p', isLast: (gameState.actionsLeft <= 0) });
    
    updateUI(); render();
}

export function useForge() {
    if (!gameState.selectedPiece) return;
    const p = gameState.board[gameState.selectedPiece.r][gameState.selectedPiece.c];
    if (!p || !p.onForge) return;
    if (gameState.myResources.metal < 2 || gameState.myResources.coal < 2) {
        showToast("НУЖНО 2 МЕТАЛЛА И 2 УГЛЯ!");
        return;
    }
    gameState.myResources.metal -= 2;
    gameState.myResources.coal -= 2;
    p.armor = (p.armor || 0) + 1;
    sendNetworkMessage({ type: 'forge_armor', r: gameState.selectedPiece.r, c: gameState.selectedPiece.c });
    render(); updateUI();
}

export function finishAcademyRecruit(newType, paperCost) {
    if (gameState.actionsLeft < 1) { showToast("НЕТ ОД ДЛЯ ОБУЧЕНИЯ!"); return; }
    if (gameState.myResources.paper < paperCost) { showToast(`НЕ ХВАТАЕТ БУМАГИ (НУЖНО ${paperCost})!`); return; }
    
    const { from, acad } = gameState.pendingAcademy;
    const dir = gameState.playerColor === 'w' ? -1 : 1;
    const spawnR = acad.r + dir;
    const spawnC = acad.c;

    if (spawnR < 0 || spawnR >= gameState.rows || gameState.board[spawnR][spawnC]) {
        showToast("ВЫХОД ИЗ АКАДЕМИИ ЗАБЛОКИРОВАН!");
        closeModal('academy-modal');
        return; 
    }

    gameState.myResources.paper -= paperCost;

    gameState.board[from.r][from.c] = null;
    gameState.board[spawnR][spawnC] = { type: newType, color: gameState.playerColor, moved: true, freeMoveUsed: false, armor: 0 };
    gameState.actionsLeft--; 
    sendNetworkMessage({ type: 'transform', from: from, to: {r:spawnR, c:spawnC}, newType: newType, isLast: (gameState.actionsLeft <= 0) });
    closeModal('academy-modal');
    updateUI(); render();
}

export function finishPromotion(newType) {
    document.getElementById('promotion-modal').classList.add('hidden');
    const { fr, fc, tr, tc } = gameState.pendingMove;
    gameState.board[tr][tc] = gameState.board[fr][fc]; 
    gameState.board[tr][tc].type = newType; 
    gameState.board[fr][fc] = null;
    gameState.actionsLeft--;
    sendNetworkMessage({ type: 'move', from: {r:fr, c:fc}, to: {r:tr, c:tc}, isLast: (gameState.actionsLeft <= 0), win: false, promoteTo: newType });
    gameState.pendingMove = null; updateUI(); render();
}

export function isValidMove(fr, fc, tr, tc) {
    if (tr < 0 || tr >= gameState.rows || tc < 0 || tc >= gameState.cols) return false;
    const p = gameState.board[fr][fc]; 
    if (!p) return false;
    const dest = gameState.board[tr][tc];

    const startFog = isFog(fr, fc);
    const endFog = isFog(tr, tc);
    const baseType = p.type.replace('_2', '');
    const isKnight = baseType === 'n';

    if (gameState.isExpanded) {
        // Base logic: 0-3 (Top), 4-11 (Fog), 12-15 (Bottom)
        const startBase = (fr < 4) ? 1 : (fr > 11 ? 2 : 0);
        const endBase = (tr < 4) ? 1 : (tr > 11 ? 2 : 0);
        
        // Cannot move between bases directly
        if (startBase !== 0 && endBase !== 0 && startBase !== endBase) {
            return false;
        }

        // Fog movement restriction (except Knights)
        if (startFog !== endFog && !isKnight) {
            if (Math.abs(tr - fr) > 1 || Math.abs(tc - fc) > 1) return false;
        }
    }

    if (dest && dest.type === 'forge') return true;
    if (dest && dest.color === p.color) {
        if ((dest.type === 'academy' || dest.type === 'academy_t2') && p.type === 'p') return true; 
        return false; 
    }
    if (dest && isUpgradedUnit(dest) && p.type === 'p') return false;
    
    const dr = tr - fr, dc = tc - fc; 
    const adr = Math.abs(dr), adc = Math.abs(dc);

    if (['b','r','q'].includes(baseType)) {
        if (!isPathClear(fr, fc, tr, tc)) return false;
    }

    switch(baseType) {
        case 'p':
            const dir = p.color === 'w' ? -1 : 1;
            if (dest && (dest.type === 'academy' || dest.type === 'academy_t2') && dest.color === p.color) return true;
            if (dc === 0 && !dest && dr === dir) return true;
            if (dc === 0 && !dest && !p.moved && dr === 2 * dir) {
                if (!gameState.board[fr + dir][fc]) return true;
            }
            if (adc === 1 && dr === dir && dest && dest.color !== p.color) return true;
            return false;
        case 'n': return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
        case 'b': return adr === adc; 
        case 'r': return (dr === 0 || dc === 0); 
        case 'q': return (adr === adc || dr === 0 || dc === 0); 
        case 'k': return (adr <= 1 && adc <= 1); 
    }
    return false;
}

function isPathClear(fr, fc, tr, tc) {
    const stepR = Math.sign(tr - fr), stepC = Math.sign(tc - fc);
    let curR = fr + stepR, curC = fc + stepC;
    while (curR !== tr || curC !== tc) { 
        if (gameState.board[curR][curC]) return false; 
        curR += stepR; curC += stepC; 
    }
    return true;
}

export function movePiece(fr, fc, tr, tc) {
    const piece = gameState.board[fr][fc];
    const dest = gameState.board[tr][tc];

    if (dest && (dest.type === 'academy' || dest.type === 'academy_t2') && dest.color === piece.color && piece.type === 'p') {
        openAcademyModal(fr, fc, tr, tc, dest.type === 'academy_t2');
        return;
    }

    if (dest && dest.type === 'forge') {
        if (dest.color === piece.color || !dest.color) { 
            if (piece.onForge) gameState.board[fr][fc] = { type: 'forge', color: piece.color };
            else gameState.board[fr][fc] = null;
            piece.onForge = true; piece.moved = true;
            gameState.board[tr][tc] = piece;
            gameState.actionsLeft--;
            sendNetworkMessage({ type: 'move', from: {r:fr, c:fc}, to: {r:tr, c:tc}, isLast: (gameState.actionsLeft<=0), onForgeEnter: true });
            updateUI(); render();
            return;
        }
    }

    if (piece.onForge) { gameState.board[fr][fc] = { type: 'forge', color: piece.color }; piece.onForge = false; }
    else { gameState.board[fr][fc] = null; }

    if (dest && dest.color !== piece.color) {
        if (dest.type.startsWith('fortress')) {
            if (dest.hp > 1) {
                dest.hp--;
                if (gameState.board[fr][fc] && gameState.board[fr][fc].type === 'forge') { gameState.board[fr][fc] = piece; piece.onForge = true; }
                else { gameState.board[fr][fc] = piece; }
                gameState.actionsLeft--;
                sendNetworkMessage({ type: 'attack_hit', r: tr, c: tc, hp: dest.hp, isLast: (gameState.actionsLeft<=0) });
                updateUI(); render();
                return;
            }
        }
        if (dest.armor > 0) {
            dest.armor--;
            if (gameState.board[fr][fc] && gameState.board[fr][fc].type === 'forge') { gameState.board[fr][fc] = piece; piece.onForge = true; }
            else { gameState.board[fr][fc] = piece; }
            gameState.actionsLeft--;
            sendNetworkMessage({ type: 'attack_armor', r: tr, c: tc, armor: dest.armor, isLast: (gameState.actionsLeft<=0) });
            updateUI(); render();
            return;
        }
    }

    let isWinMove = (dest && dest.type === 'k');
    if (isWinMove) endGame(true);

    let costsAP = true;
    if (isUpgradedUnit(piece)) {
        if (!piece.freeMoveUsed) { costsAP = false; piece.freeMoveUsed = true; }
    }

    gameState.board[tr][tc] = piece; 
    piece.moved = true; 
    if (costsAP) gameState.actionsLeft--;
    
    const endRow = gameState.playerColor === 'w' ? 0 : (gameState.rows - 1);
    if (piece.type === 'p' && tr === endRow && !isWinMove) {
        showPromotionModal(fr, fc, tr, tc); 
        return; 
    }

    sendNetworkMessage({ 
        type: 'move', from: {r:fr, c:fc}, to: {r:tr, c:tc}, 
        isLast: (gameState.actionsLeft <= 0), win: isWinMove, 
        freeMoveUsed: !costsAP 
    });
    updateUI(); render();
}

export function isNearOwnPiece(r, c, type) {
    if (gameState.board[r][c] && gameState.board[r][c].color === gameState.playerColor && (type.endsWith('_t2') || type.endsWith('_t3') || type === 'academy')) return true;
    if (gameState.board[r][c]) return false; 
    
    const targetIsFog = isFog(r, c);
    for(let dr = -1; dr <= 1; dr++) {
        for(let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < gameState.rows && nc >= 0 && nc < gameState.cols) {
                const neighbor = gameState.board[nr][nc];
                if (neighbor && neighbor.color === gameState.playerColor && !BUILDINGS.includes(neighbor.type)) {
                    if (targetIsFog === isFog(nr, nc)) return true;
                }
            }
        }
    }
    return false;
}

export function onPiecePointerDown(e, fr, fc) {
    if (gameState.gameOver || !gameState.currentRoom || gameState.actionsLeft <= 0 || gameState.isBuildMode) {
         if (!gameState.isBuildMode && gameState.board[fr][fc] && gameState.board[fr][fc].onForge && gameState.board[fr][fc].color === gameState.playerColor) {
             gameState.selectedPiece = {r: fr, c: fc}; render(); 
         }
         return;
    }
    if (gameState.board[fr][fc] && gameState.board[fr][fc].type === 'camp') return;
    const p = gameState.board[fr][fc];
    if (!p || p.color !== gameState.playerColor) return;
    gameState.selectedPiece = {r: fr, c: fc}; 
    dragState.isBuildingDrag = false;
    dragState.from = { r: fr, c: fc };
    const baseType = p.type.replace('_2', '');
    initDrag(e, `url(${PIECE_URLS[p.color + baseType]})`);
}

export function onSidebarPointerDown(e, type) {
    if (gameState.gameOver || !gameState.currentRoom || gameState.actionsLeft <= 0 || !gameState.isBuildMode) return;
    dragState.isBuildingDrag = true;
    dragState.from = { type: type };
    initDrag(e, null, BUILDING_ICONS[type] || BUILDING_ICONS[type.replace('_t2','').replace('_t3','')]);
}