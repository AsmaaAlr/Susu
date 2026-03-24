const elements = {
  board: document.getElementById('board'),
  numberPad: document.getElementById('numberPad'),
  difficulty: document.getElementById('difficulty'),
  difficultyLabel: document.getElementById('difficultyLabel'),
  timer: document.getElementById('timer'),
  mistakes: document.getElementById('mistakes'),
  notesBtn: document.getElementById('notesBtn'),
  hintBtn: document.getElementById('hintBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  undoBtn: document.getElementById('undoBtn'),
  themeToggle: document.getElementById('themeToggle'),
  themeToggleInside: document.getElementById('themeToggleInside'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlayText: document.getElementById('overlayText'),
  overlayClose: document.getElementById('overlayClose'),
  overlayNewGame: document.getElementById('overlayNewGame'),
  overlayWhatsApp: document.getElementById('overlayWhatsApp'),
  shareCanvas: document.getElementById('shareCanvas'),
  shareHelp: document.getElementById('shareHelp'),
};

const labels = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };

const state = {
  difficulty: 'easy',
  puzzle: [],
  solution: [],
  current: [],
  fixed: new Set(),
  notes: {},
  selected: null,
  notesMode: false,
  mistakes: 0,
  maxMistakes: 3,
  seconds: 0,
  interval: null,
  paused: false,
  gameOver: false,
  hintsUsed: 0,
  history: [],
  wrongCells: new Set(),
};

function deepCopyGrid(grid) { return grid.map(row => [...row]); }
function cloneNotes(notes) {
  return Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, [...v]]));
}
function keyOf(r, c) { return `${r}-${c}`; }
function formatTime(total) {
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}
function samplePuzzle(difficulty) {
  const list = window.SUDOKU_PUZZLES[difficulty];
  const chosen = list[Math.floor(Math.random() * list.length)];
  return { puzzle: deepCopyGrid(chosen.puzzle), solution: deepCopyGrid(chosen.solution) };
}
function setThemeUI() {
  const isNight = document.documentElement.getAttribute('data-theme') === 'night';
  const title = isNight ? 'الوضع النهاري' : 'الوضع الليلي';
  elements.themeToggle.title = title;
  elements.themeToggle.setAttribute('aria-label', title);
  elements.themeToggleInside.innerHTML = `<span class="setting-btn-icon">◐</span><span>${title}</span>`;
}
function updateHeader() {
  elements.difficultyLabel.textContent = labels[state.difficulty];
  elements.timer.textContent = formatTime(state.seconds);
  elements.mistakes.textContent = `${state.mistakes} / ${state.maxMistakes}`;
  elements.notesBtn.classList.toggle('active', state.notesMode);
}
function startTimer() {
  clearInterval(state.interval);
  state.interval = setInterval(() => {
    if (!state.paused && !state.gameOver) {
      state.seconds += 1;
      updateHeader();
    }
  }, 1000);
}
function buildFixedSet() {
  state.fixed.clear();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.puzzle[r][c] !== 0) state.fixed.add(keyOf(r, c));
    }
  }
}
function pushHistory() {
  state.history.push({
    current: deepCopyGrid(state.current),
    notes: cloneNotes(state.notes),
    selected: state.selected ? { ...state.selected } : null,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    wrongCells: new Set(state.wrongCells),
  });
  if (state.history.length > 200) state.history.shift();
}
function resetRuntimeState() {
  state.notes = {};
  state.selected = null;
  state.notesMode = false;
  state.mistakes = 0;
  state.seconds = 0;
  state.paused = false;
  state.gameOver = false;
  state.hintsUsed = 0;
  state.history = [];
  state.wrongCells = new Set();
}
function initGame(difficulty = state.difficulty) {
  state.difficulty = difficulty;
  const data = samplePuzzle(difficulty);
  state.puzzle = data.puzzle;
  state.solution = data.solution;
  state.current = deepCopyGrid(data.puzzle);
  resetRuntimeState();
  buildFixedSet();
  updateHeader();
  renderBoard();
  closeSettings();
}
function getConflictsForCell(row, col, val) {
  if (!val) return [];
  const conflicts = [];
  for (let c = 0; c < 9; c++) if (c !== col && state.current[row][c] === val) conflicts.push([row, c]);
  for (let r = 0; r < 9; r++) if (r !== row && state.current[r][col] === val) conflicts.push([r, col]);
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && state.current[r][c] === val) conflicts.push([r, c]);
    }
  }
  return conflicts;
}
function allConflictKeys() {
  const set = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = state.current[r][c];
      if (!val) continue;
      const conflicts = getConflictsForCell(r, c, val);
      if (conflicts.length) {
        set.add(keyOf(r, c));
        conflicts.forEach(([rr, cc]) => set.add(keyOf(rr, cc)));
      }
    }
  }
  return set;
}
function renderCellContent(cell, r, c) {
  const val = state.current[r][c];
  cell.innerHTML = '';
  if (val) {
    cell.textContent = val;
    return;
  }
  const notes = state.notes[keyOf(r, c)] || [];
  if (notes.length) {
    const notesGrid = document.createElement('div');
    notesGrid.className = 'notes-grid';
    for (let i = 1; i <= 9; i++) {
      const slot = document.createElement('span');
      slot.textContent = notes.includes(i) ? i : '';
      notesGrid.appendChild(slot);
    }
    cell.appendChild(notesGrid);
  }
}
function renderBoard() {
  elements.board.innerHTML = '';
  const conflictSet = allConflictKeys();
  const selectedVal = state.selected ? state.current[state.selected.row][state.selected.col] : null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      const fixed = state.fixed.has(keyOf(r, c));
      if (fixed) cell.classList.add('fixed');
      if ((c + 1) % 3 === 0 && c !== 8) cell.classList.add('box-right');
      if ((r + 1) % 3 === 0 && r !== 8) cell.classList.add('box-bottom');

      if (state.selected) {
        const sameRow = state.selected.row === r;
        const sameCol = state.selected.col === c;
        const sameBox = Math.floor(state.selected.row / 3) === Math.floor(r / 3) && Math.floor(state.selected.col / 3) === Math.floor(c / 3);
        if (sameRow || sameCol || sameBox) cell.classList.add('related');
        if (state.selected.row === r && state.selected.col === c) cell.classList.add('selected');
      }
      if (selectedVal && state.current[r][c] === selectedVal) cell.classList.add('same-number');
      if (conflictSet.has(keyOf(r, c))) cell.classList.add('conflict');
      if (state.wrongCells.has(keyOf(r, c))) cell.classList.add('wrong');
      if (state.paused) cell.classList.add('paused');

      renderCellContent(cell, r, c);
      cell.addEventListener('click', () => selectCell(r, c));
      elements.board.appendChild(cell);
    }
  }
}
function selectCell(row, col) {
  if (state.paused || state.gameOver) return;
  state.selected = { row, col };
  renderBoard();
}
function toggleNote(r, c, num) {
  const k = keyOf(r, c);
  const currentNotes = state.notes[k] || [];
  state.notes[k] = currentNotes.includes(num)
    ? currentNotes.filter(n => n !== num)
    : [...currentNotes, num].sort((a, b) => a - b);
}
function handleInput(num) {
  if (!state.selected || state.paused || state.gameOver) return;
  const { row, col } = state.selected;
  const key = keyOf(row, col);
  if (state.fixed.has(key)) return;

  pushHistory();

  if (state.notesMode) {
    if (state.current[row][col] !== 0) return;
    toggleNote(row, col, num);
    renderBoard();
    return;
  }

  state.current[row][col] = num;
  delete state.notes[key];

  if (num !== state.solution[row][col]) {
    if (!state.wrongCells.has(key)) state.mistakes += 1;
    state.wrongCells.add(key);
    if (state.mistakes >= state.maxMistakes) {
      state.gameOver = true;
      updateHeader();
      renderBoard();
      revealLoss();
      return;
    }
  } else {
    state.wrongCells.delete(key);
  }

  updateHeader();
  renderBoard();
  checkWin();
}
function undoLastMove() {
  if (!state.history.length || state.gameOver) return;
  const last = state.history.pop();
  state.current = deepCopyGrid(last.current);
  state.notes = cloneNotes(last.notes);
  state.selected = last.selected ? { ...last.selected } : null;
  state.mistakes = last.mistakes;
  state.hintsUsed = last.hintsUsed;
  state.wrongCells = new Set(last.wrongCells);
  updateHeader();
  renderBoard();
}
function getEmptyCells() {
  const cells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.current[r][c] === 0 || state.wrongCells.has(keyOf(r,c))) cells.push([r, c]);
    }
  }
  return cells;
}
function useHint() {
  if (state.paused || state.gameOver) return;
  const empties = getEmptyCells();
  if (!empties.length) return;
  pushHistory();
  const preferred = state.selected && !state.fixed.has(keyOf(state.selected.row, state.selected.col)) ? [state.selected.row, state.selected.col] : null;
  const [row, col] = preferred || empties[Math.floor(Math.random() * empties.length)];
  const key = keyOf(row, col);
  state.current[row][col] = state.solution[row][col];
  delete state.notes[key];
  state.wrongCells.delete(key);
  state.hintsUsed += 1;
  state.selected = { row, col };
  renderBoard();
  checkWin();
}
function checkWin() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.current[r][c] !== state.solution[r][c]) return false;
    }
  }
  state.gameOver = true;
  const score = getScore();
  showOverlay('أبدعتي ✨', `Good Job — خلصتي مستوى ${labels[state.difficulty]} في ${formatTime(state.seconds)} | السكور: ${score}`);
  return true;
}
function getScore() {
  const base = { easy: 1000, medium: 1500, hard: 2200 }[state.difficulty];
  const timePenalty = Math.min(state.seconds * 2, Math.floor(base * 0.5));
  const mistakePenalty = state.mistakes * 120;
  const hintPenalty = state.hintsUsed * 160;
  return Math.max(100, base - timePenalty - mistakePenalty - hintPenalty);
}
function revealLoss() {
  showOverlay('انتهت اللعبة', 'وصلتي الحد الأقصى من الأخطاء. جربي لعبة جديدة.');
}
function showOverlay(title, text) {
  elements.overlayTitle.textContent = title;
  elements.overlayText.textContent = text;
  elements.shareHelp.textContent = '';
  elements.overlay.classList.remove('hidden');
  if (state.gameOver && isSolved()) drawShareCard();
}
function closeOverlay() { elements.overlay.classList.add('hidden'); }
function isSolved() {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (state.current[r][c] !== state.solution[r][c]) return false;
  return true;
}
function buildNumberPad() {
  elements.numberPad.innerHTML = '';
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pad-btn';
    btn.textContent = i;
    btn.addEventListener('click', () => handleInput(i));
    elements.numberPad.appendChild(btn);
  }
}
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'night' ? 'day' : 'night';
  if (next === 'night') root.setAttribute('data-theme', 'night');
  else root.removeAttribute('data-theme');
  setThemeUI();
}
function openSettings() { elements.settingsPanel.classList.remove('hidden'); }
function closeSettings() { elements.settingsPanel.classList.add('hidden'); }
function toggleSettings() { elements.settingsPanel.classList.toggle('hidden'); }

function drawRoundedRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function drawShareCard() {
  const canvas = elements.shareCanvas;
  const ctx = canvas.getContext('2d');
  const isNight = document.documentElement.getAttribute('data-theme') === 'night';
  const palette = isNight ? {
    bg: '#17120f', card: '#221c18', cell: '#2b241f', fixed: '#3a312b', border: '#85715f', text: '#fff3e7', muted: '#d8c4b1', good: '#54c17d'
  } : {
    bg: '#EDE4D8', card: '#F5EFE6', cell: '#fbf7f1', fixed: '#e8dfd2', border: '#bba792', text: '#3B2F2F', muted: '#7A6A5A', good: '#3FA66B'
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRoundedRect(ctx, 56, 56, canvas.width - 112, canvas.height - 112, 36, palette.card);

  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  ctx.font = '800 58px Tajawal';
  ctx.fillText('Good Job ✨', canvas.width / 2, 150);
  ctx.font = '700 46px Tajawal';
  ctx.fillText('سودوكو', canvas.width / 2, 210);

  ctx.fillStyle = palette.muted;
  ctx.font = '600 30px Tajawal';
  ctx.fillText(`المستوى: ${labels[state.difficulty]}  |  الوقت: ${formatTime(state.seconds)}  |  السكور: ${getScore()}`, canvas.width / 2, 265);

  const boardSize = 760;
  const startX = (canvas.width - boardSize) / 2;
  const startY = 330;
  const cellSize = boardSize / 9;

  drawRoundedRect(ctx, startX - 6, startY - 6, boardSize + 12, boardSize + 12, 28, palette.border);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = startX + c * cellSize;
      const y = startY + r * cellSize;
      const fixed = state.fixed.has(keyOf(r, c));
      ctx.fillStyle = fixed ? palette.fixed : palette.cell;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      ctx.fillStyle = palette.text;
      ctx.font = `${fixed ? 800 : 700} 40px Tajawal`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(String(state.current[r][c]), x + cellSize / 2, y + cellSize / 2 + 4);
    }
  }
  ctx.strokeStyle = palette.border;
  for (let i = 0; i <= 9; i++) {
    ctx.lineWidth = i % 3 === 0 ? 5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + i * cellSize, startY);
    ctx.lineTo(startX + i * cellSize, startY + boardSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX, startY + i * cellSize);
    ctx.lineTo(startX + boardSize, startY + i * cellSize);
    ctx.stroke();
  }

  ctx.fillStyle = palette.muted;
  ctx.font = '600 28px Tajawal';
  ctx.fillText(`الأخطاء: ${state.mistakes}/${state.maxMistakes}   |   التلميحات: ${state.hintsUsed}`, canvas.width / 2, 1160);
  ctx.font = '600 24px Tajawal';
  ctx.fillText(location.href, canvas.width / 2, 1210);
}
function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
async function shareToWhatsApp() {
  if (!isSolved()) return;
  drawShareCard();
  const score = getScore();
  const text = `Good Job ✨\nأنهيت سودوكو\nالمستوى: ${labels[state.difficulty]}\nالوقت: ${formatTime(state.seconds)}\nالسكور: ${score}`;
  const blob = await canvasToBlob(elements.shareCanvas);
  if (!blob) {
    elements.shareHelp.textContent = 'تعذر تجهيز صورة النتيجة.';
    return;
  }
  const file = new File([blob], 'sudoku-result.png', { type: 'image/png' });

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], text, title: 'Sudoku Result' });
      elements.shareHelp.textContent = 'تم فتح المشاركة. اختاري واتساب.';
      return;
    }
  } catch {}

  try {
    const url = `https://wa.me/?text=${encodeURIComponent(`${text}\n${location.href}`)}`;
    window.open(url, '_blank', 'noopener');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sudoku-result.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    elements.shareHelp.textContent = 'انفتح واتساب بالنص، ونزلت الصورة عندك لأن المتصفح ما يدعم إرفاقها تلقائيًا.';
  } catch {
    elements.shareHelp.textContent = 'تعذرت المشاركة على واتساب من هذا المتصفح.';
  }
}
function attachEvents() {
  elements.difficulty.addEventListener('change', e => initGame(e.target.value));
  elements.newGameBtn.addEventListener('click', () => initGame(elements.difficulty.value));
  elements.notesBtn.addEventListener('click', () => {
    state.notesMode = !state.notesMode;
    updateHeader();
  });
  elements.hintBtn.addEventListener('click', useHint);
  elements.undoBtn.addEventListener('click', undoLastMove);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.themeToggleInside.addEventListener('click', toggleTheme);
  elements.settingsToggle.addEventListener('click', toggleSettings);
  elements.overlayClose.addEventListener('click', closeOverlay);
  elements.overlayNewGame.addEventListener('click', () => {
    closeOverlay();
    initGame(state.difficulty);
  });
  elements.overlayWhatsApp.addEventListener('click', shareToWhatsApp);

  document.addEventListener('click', e => {
    if (!elements.settingsPanel.contains(e.target) && !elements.settingsToggle.contains(e.target)) closeSettings();
  });

  document.addEventListener('keydown', e => {
    if (state.paused || state.gameOver) return;
    if (/^[1-9]$/.test(e.key)) handleInput(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!state.selected) return;
      const { row, col } = state.selected;
      const k = keyOf(row, col);
      if (state.fixed.has(k)) return;
      pushHistory();
      state.current[row][col] = 0;
      delete state.notes[k];
      state.wrongCells.delete(k);
      renderBoard();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoLastMove();
      return;
    }
    if (!state.selected) return;
    const { row, col } = state.selected;
    if (e.key === 'ArrowUp') state.selected = { row: Math.max(0, row - 1), col };
    if (e.key === 'ArrowDown') state.selected = { row: Math.min(8, row + 1), col };
    if (e.key === 'ArrowLeft') state.selected = { row, col: Math.min(8, col + 1) };
    if (e.key === 'ArrowRight') state.selected = { row, col: Math.max(0, col - 1) };
    renderBoard();
  });
}

buildNumberPad();
attachEvents();
setThemeUI();
initGame('easy');
startTimer();
