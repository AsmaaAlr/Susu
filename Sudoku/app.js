const elements = {
  board: document.getElementById('board'),
  numberPad: document.getElementById('numberPad'),
  difficulty: document.getElementById('difficulty'),
  difficultyLabel: document.getElementById('difficultyLabel'),
  timer: document.getElementById('timer'),
  mistakes: document.getElementById('mistakes'),
  messageBox: document.getElementById('messageBox'),
  notesBtn: document.getElementById('notesBtn'),
  eraseBtn: document.getElementById('eraseBtn'),
  hintBtn: document.getElementById('hintBtn'),
  checkBtn: document.getElementById('checkBtn'),
  restartBtn: document.getElementById('restartBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  shareBtn: document.getElementById('shareBtn'),
  themeToggle: document.getElementById('themeToggle'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlayText: document.getElementById('overlayText'),
  overlayClose: document.getElementById('overlayClose'),
  overlayNewGame: document.getElementById('overlayNewGame'),
};

const labels = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب'
};

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
  startedAt: null,
  hintsUsed: 0,
};

function deepCopyGrid(grid) {
  return grid.map(row => [...row]);
}

function keyOf(r, c) {
  return `${r}-${c}`;
}

function formatTime(total) {
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function samplePuzzle(difficulty) {
  const list = window.SUDOKU_PUZZLES[difficulty];
  const chosen = list[Math.floor(Math.random() * list.length)];
  return {
    puzzle: deepCopyGrid(chosen.puzzle),
    solution: deepCopyGrid(chosen.solution),
  };
}

function setMessage(text) {
  elements.messageBox.textContent = text;
}

function updateHeader() {
  elements.difficultyLabel.textContent = labels[state.difficulty];
  elements.timer.textContent = formatTime(state.seconds);
  elements.mistakes.textContent = `${state.mistakes} / ${state.maxMistakes}`;
  elements.notesBtn.classList.toggle('active', state.notesMode);
  elements.pauseBtn.textContent = state.paused ? 'استئناف' : 'إيقاف';
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

function initGame(difficulty = state.difficulty) {
  state.difficulty = difficulty;
  const data = samplePuzzle(difficulty);
  state.puzzle = data.puzzle;
  state.solution = data.solution;
  state.current = deepCopyGrid(data.puzzle);
  state.notes = {};
  state.selected = null;
  state.notesMode = false;
  state.mistakes = 0;
  state.seconds = 0;
  state.paused = false;
  state.gameOver = false;
  state.hintsUsed = 0;
  state.startedAt = new Date();
  buildFixedSet();
  updateHeader();
  renderBoard();
  setMessage('اختاري خانة وابدئي الحل.');
}

function getConflictsForCell(row, col, val) {
  if (!val) return [];
  const conflicts = [];
  for (let c = 0; c < 9; c++) {
    if (c !== col && state.current[row][c] === val) conflicts.push([row, c]);
  }
  for (let r = 0; r < 9; r++) {
    if (r !== row && state.current[r][col] === val) conflicts.push([r, col]);
  }
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
  if (currentNotes.includes(num)) {
    state.notes[k] = currentNotes.filter(n => n !== num);
  } else {
    state.notes[k] = [...currentNotes, num].sort((a, b) => a - b);
  }
}

function handleInput(num) {
  if (!state.selected || state.paused || state.gameOver) return;
  const { row, col } = state.selected;
  if (state.fixed.has(keyOf(row, col))) {
    setMessage('هذه الخانة ثابتة.');
    return;
  }

  if (state.notesMode) {
    if (state.current[row][col] !== 0) return;
    toggleNote(row, col, num);
    renderBoard();
    return;
  }

  state.current[row][col] = num;
  delete state.notes[keyOf(row, col)];

  if (num !== state.solution[row][col]) {
    state.mistakes += 1;
    setMessage('إجابة غير صحيحة.');
    if (state.mistakes >= state.maxMistakes) {
      state.gameOver = true;
      revealLoss();
    }
  } else {
    setMessage('ممتاز.');
  }

  updateHeader();
  renderBoard();
  if (!state.gameOver) checkWin();
}

function eraseSelected() {
  if (!state.selected || state.paused || state.gameOver) return;
  const { row, col } = state.selected;
  if (state.fixed.has(keyOf(row, col))) return;
  state.current[row][col] = 0;
  delete state.notes[keyOf(row, col)];
  renderBoard();
  setMessage('تم مسح الخانة.');
}

function getEmptyCells() {
  const cells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.current[r][c] === 0) cells.push([r, c]);
    }
  }
  return cells;
}

function useHint() {
  if (state.paused || state.gameOver) return;
  const empties = getEmptyCells();
  if (!empties.length) return;
  const [row, col] = state.selected && state.current[state.selected.row][state.selected.col] === 0
    ? [state.selected.row, state.selected.col]
    : empties[Math.floor(Math.random() * empties.length)];

  state.current[row][col] = state.solution[row][col];
  delete state.notes[keyOf(row, col)];
  state.hintsUsed += 1;
  state.selected = { row, col };
  renderBoard();
  setMessage('تم استخدام تلميح.');
  checkWin();
}

function checkCurrentBoard() {
  const wrong = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = state.current[r][c];
      if (value !== 0 && value !== state.solution[r][c]) wrong.push([r, c]);
    }
  }
  if (!wrong.length) {
    setMessage('ماكو أخطاء حالياً.');
  } else {
    setMessage(`في ${wrong.length} خانات غير صحيحة.`);
  }
  renderBoard();
}

function checkWin() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.current[r][c] !== state.solution[r][c]) return false;
    }
  }
  state.gameOver = true;
  showOverlay('أبدعتي ✨', `خلصتي مستوى ${labels[state.difficulty]} في ${formatTime(state.seconds)}${state.hintsUsed ? ` مع ${state.hintsUsed} تلميح` : ''}.`);
  return true;
}

function revealLoss() {
  showOverlay('انتهت اللعبة', 'وصلتي الحد الأقصى من الأخطاء. جربي لعبة جديدة.');
}

function showOverlay(title, text) {
  elements.overlayTitle.textContent = title;
  elements.overlayText.textContent = text;
  elements.overlay.classList.remove('hidden');
}

function closeOverlay() {
  elements.overlay.classList.add('hidden');
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
  const erase = document.createElement('button');
  erase.type = 'button';
  erase.className = 'pad-btn';
  erase.textContent = '⌫';
  erase.addEventListener('click', eraseSelected);
  elements.numberPad.appendChild(erase);
}

async function shareResult() {
  const filled = state.current.flat().filter(Boolean).length;
  const text = `أنهيت/ألعب سودوكو — المستوى: ${labels[state.difficulty]} | الوقت: ${formatTime(state.seconds)} | الأخطاء: ${state.mistakes}/${state.maxMistakes} | التلميحات: ${state.hintsUsed} | التقدم: ${filled}/81`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Sudoku Result', text, url: location.href });
      setMessage('تمت مشاركة النتيجة.');
    } else {
      await navigator.clipboard.writeText(`${text} | ${location.href}`);
      setMessage('تم نسخ النتيجة والرابط.');
    }
  } catch {
    setMessage('تعذرت المشاركة حالياً.');
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'night' ? 'day' : 'night';
  if (next === 'night') root.setAttribute('data-theme', 'night');
  else root.removeAttribute('data-theme');
  elements.themeToggle.textContent = next === 'night' ? 'Day' : 'Night';
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  updateHeader();
  renderBoard();
  setMessage(state.paused ? 'تم إيقاف اللعبة مؤقتاً.' : 'رجعنا نكمل.');
}

function attachEvents() {
  elements.difficulty.addEventListener('change', e => initGame(e.target.value));
  elements.newGameBtn.addEventListener('click', () => initGame(elements.difficulty.value));
  elements.restartBtn.addEventListener('click', () => initGame(state.difficulty));
  elements.notesBtn.addEventListener('click', () => {
    state.notesMode = !state.notesMode;
    updateHeader();
    setMessage(state.notesMode ? 'وضع الملاحظات شغال.' : 'وضع الملاحظات توقف.');
  });
  elements.eraseBtn.addEventListener('click', eraseSelected);
  elements.hintBtn.addEventListener('click', useHint);
  elements.checkBtn.addEventListener('click', checkCurrentBoard);
  elements.pauseBtn.addEventListener('click', togglePause);
  elements.shareBtn.addEventListener('click', shareResult);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.overlayClose.addEventListener('click', closeOverlay);
  elements.overlayNewGame.addEventListener('click', () => {
    closeOverlay();
    initGame(state.difficulty);
  });

  document.addEventListener('keydown', e => {
    if (state.paused || state.gameOver) return;
    if (/^[1-9]$/.test(e.key)) handleInput(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete') eraseSelected();
    if (!state.selected) return;
    const { row, col } = state.selected;
    if (e.key === 'ArrowUp') state.selected = { row: Math.max(0, row - 1), col };
    if (e.key === 'ArrowDown') state.selected = { row: Math.min(8, row + 1), col };
    if (e.key === 'ArrowLeft') state.selected = { row, col: Math.max(0, col - 1) };
    if (e.key === 'ArrowRight') state.selected = { row, col: Math.min(8, col + 1) };
    renderBoard();
  });
}

buildNumberPad();
attachEvents();
initGame('easy');
startTimer();
