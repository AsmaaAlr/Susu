const STATUS_PRIORITY = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

const ENGLISH_TO_ARABIC_KEY_MAP = {
  q: "ض",
  w: "ص",
  e: "ث",
  r: "ق",
  t: "ف",
  y: "غ",
  u: "ع",
  i: "ه",
  o: "خ",
  p: "ح",
  "[": "ج",
  "]": "د",
  a: "ش",
  s: "س",
  d: "ي",
  f: "ب",
  g: "ل",
  h: "ا",
  j: "ت",
  k: "ن",
  l: "م",
  ";": "ك",
  "'": "ط",
  z: "ئ",
  x: "X",
  c: "ؤ",
  v: "ر",
  n: "ى",
  m: "ة",
  ",": "و",
  ".": "ز",
  "/": "ظ",
};

const state = {
  config: null,
  keyboardRows: [],
  answers: [],
  allowedGuesses: new Set(),
  normalizedAllowedGuesses: new Set(),
  puzzle: null,
  answer: "",
  normalizedAnswer: "",
  wordLength: 0,
  attempts: [],
  currentGuess: "",
  selectedPlaceholderIndex: null,
  keyboardState: {},
  maxAttempts: 6,
  finished: false,
  hintsUsed: 0,
  maxHints: 2,
  revealedHints: [],
};

const elements = {
  title: document.querySelector("#app-title"),
  hintDisplay: document.querySelector("#hint-display"),
  resultBanner: document.querySelector("#result-banner"),
  board: document.querySelector("#board"),
  keyboard: document.querySelector("#keyboard"),
  toast: document.querySelector("#toast"),
  hintButton: document.querySelector("#hint-button"),
  resetButton: document.querySelector("#reset-button"),
  possiblePanel: document.querySelector("#possible-panel"),
  possiblePositions: document.querySelector("#possible-positions"),
  celebrationCanvas: document.querySelector("#fx-canvas"),
};

init().catch((error) => {
  console.error(error);
  showToast("تعذر تحميل البيانات");
});

async function init() {
  const embeddedData = window.WORDL_DATA;
  if (!embeddedData) {
    throw new Error("WORDL_DATA is missing");
  }

  const configData = embeddedData.config ?? {};
  const keyboardData = embeddedData.keyboard ?? {};
  const answersData = embeddedData.answers ?? {};
  const allowedData = embeddedData.allowedGuesses ?? {};

  state.config = configData;
  state.keyboardRows = keyboardData.rows ?? [];
  state.answers = sanitizeWords(answersData.words ?? []);
  state.allowedGuesses = new Set(sanitizeWords(allowedData.words ?? []));
  state.maxAttempts = Number(configData.maxAttempts) || 6;

  state.answers.forEach((word) => state.allowedGuesses.add(word));
  state.normalizedAllowedGuesses = new Set(
    Array.from(state.allowedGuesses, (word) => normalizeArabic(word)),
  );

  if (!state.answers.length) {
    throw new Error("No answers available");
  }

  const puzzle = getOrCreateActivePuzzle();
  applyPuzzle(puzzle);

  hydrateSavedState();
  renderStaticInfo();
  renderBoard();
  renderKeyboard();
  renderHints();
  renderResultBanner();
  renderPossibilityPanel();
  bindEvents();
}

function sanitizeWords(words) {
  return words
    .filter((word) => typeof word === "string")
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !startsWithAl(word));
}

function startsWithAl(word) {
  return normalizeArabic(word).startsWith("ال");
}

function pickPuzzle() {
  const sourceWords = state.answers;
  const randomIndex = Math.floor(Math.random() * sourceWords.length);
  const word = sourceWords[randomIndex];
  return {
    id: `random-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    word,
  };
}

function getOrCreateActivePuzzle() {
  try {
    const raw = safeStorageGet("wordl:active-puzzle");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.id === "string" &&
        typeof parsed.word === "string" &&
        Array.from(parsed.word).length === 5 &&
        state.answers.includes(parsed.word)
      ) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Ignoring invalid active puzzle", error);
  }

  const nextPuzzle = pickPuzzle();
  saveActivePuzzle(nextPuzzle);
  return nextPuzzle;
}

function applyPuzzle(puzzle) {
  state.puzzle = puzzle;
  state.answer = puzzle.word;
  state.normalizedAnswer = normalizeArabic(puzzle.word);
  state.wordLength = Array.from(state.answer).length;
}

function saveActivePuzzle(puzzle) {
  safeStorageSet("wordl:active-puzzle", JSON.stringify(puzzle));
}

function hydrateSavedState() {
  const raw = safeStorageGet(storageKey());
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.attempts) || typeof saved.currentGuess !== "string") {
      return;
    }

    state.attempts = saved.attempts.filter(isValidSavedAttempt);
    state.currentGuess = Array.from(saved.currentGuess).slice(0, state.wordLength).join("");
    state.selectedPlaceholderIndex =
      Number.isInteger(saved.selectedPlaceholderIndex) ? saved.selectedPlaceholderIndex : null;
    state.keyboardState = saved.keyboardState && typeof saved.keyboardState === "object" ? saved.keyboardState : {};
    state.finished = Boolean(saved.finished);
    state.hintsUsed = Number.isInteger(saved.hintsUsed) ? Math.min(saved.hintsUsed, state.maxHints) : 0;
    state.revealedHints = Array.isArray(saved.revealedHints) ? saved.revealedHints.filter((item) => typeof item === "string") : [];
  } catch (error) {
    console.warn("Ignoring invalid saved state", error);
  }
}

function isValidSavedAttempt(entry) {
  return (
    entry &&
    typeof entry.guess === "string" &&
    Array.isArray(entry.evaluation) &&
    entry.evaluation.length === Array.from(entry.guess).length
  );
}

function persistState() {
  const snapshot = {
    attempts: state.attempts,
    currentGuess: state.currentGuess,
    selectedPlaceholderIndex: state.selectedPlaceholderIndex,
    keyboardState: state.keyboardState,
    finished: state.finished,
    hintsUsed: state.hintsUsed,
    revealedHints: state.revealedHints,
  };
  safeStorageSet(storageKey(), JSON.stringify(snapshot));
}

function storageKey() {
  return `wordl:${state.puzzle?.id ?? "random"}`;
}

function renderStaticInfo() {
  elements.title.textContent = state.config?.appName || "كلمة اليوم";
}

function renderBoard() {
  elements.board.textContent = "";

  for (let rowIndex = 0; rowIndex < state.maxAttempts; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "board-row";
    row.style.gridTemplateColumns = `repeat(${state.wordLength}, minmax(0, 1fr))`;

    const guessText =
      rowIndex < state.attempts.length
        ? state.attempts[rowIndex].guess
        : rowIndex === state.attempts.length
          ? state.currentGuess
          : "";
    const statuses = rowIndex < state.attempts.length ? state.attempts[rowIndex].evaluation : [];
    const letters = Array.from(guessText);
    const answerLetters = rowIndex < state.attempts.length ? Array.from(state.answer) : [];

    for (let colIndex = 0; colIndex < state.wordLength; colIndex += 1) {
      const tile = document.createElement("div");
      const rawLetter = letters[colIndex] ?? "";
      const answerLetter = answerLetters[colIndex] ?? "";
      const displayLetter = getDisplayLetter(rawLetter, answerLetter, rowIndex < state.attempts.length);
      tile.className = "tile";
      tile.textContent = displayLetter;

      if (rawLetter) {
        tile.classList.add("filled");
      }
      if (rowIndex === state.attempts.length && !state.finished && rawLetter) {
        tile.classList.add("selectable-placeholder");
        tile.dataset.placeholderIndex = String(colIndex);
        if (state.selectedPlaceholderIndex === colIndex) {
          tile.classList.add("selected-placeholder");
        }
      }

      if (rawLetter === "X") {
        tile.classList.add("placeholder-tile");
      }

      if (statuses[colIndex]) {
        tile.classList.add(statuses[colIndex]);
      }

      row.appendChild(tile);
    }

    elements.board.appendChild(row);
  }
}

function getDisplayLetter(guessLetter, answerLetter, isSubmittedAttempt) {
  if (guessLetter === "X") {
    return "";
  }

  if (!isSubmittedAttempt) {
    return guessLetter;
  }

  if (
    guessLetter &&
    answerLetter &&
    normalizeArabic(guessLetter) === normalizeArabic(answerLetter) &&
    isSpecialArabicVariant(answerLetter)
  ) {
    return answerLetter;
  }

  return guessLetter;
}

function isSpecialArabicVariant(letter) {
  return letter === "ى" || letter === "ئ" || letter === "ؤ" || letter === "أ" || letter === "إ" || letter === "آ" || letter === "ٱ";
}

function renderKeyboard() {
  elements.keyboard.textContent = "";

  const letterRows = state.keyboardRows.map((row) => row.filter((key) => key !== "ENTER" && key !== "⌫"));
  const rowsWithControls = [...letterRows, ["⌫", "X", "ENTER"]];
  rowsWithControls.forEach((rowValues) => {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    row.style.setProperty("--cols", String(rowValues.length));

    rowValues.forEach((rawKey) => {
      const keyButton = document.createElement("button");
      keyButton.type = "button";
      keyButton.className = "key";
      keyButton.dataset.key = rawKey;
      keyButton.textContent =
        rawKey === "ENTER" ? "إدخال" : rawKey === "⌫" ? "حذف" : rawKey === "X" ? "X" : rawKey;

      if (rawKey === "X" || rawKey === "ENTER" || rawKey === "⌫") {
        keyButton.classList.add("special", "control-key");
      }

      const status = state.keyboardState[rawKey];
      if (status) {
        keyButton.classList.add(status);
      }

      row.appendChild(keyButton);
    });

    elements.keyboard.appendChild(row);
  });
}

function renderPossibilityPanel() {
  if (!elements.possiblePanel) {
    return;
  }

  const clueData = collectProgressClueData();

  if (elements.possiblePositions) {
    elements.possiblePositions.textContent = "";
    const positionSets = derivePositionSetsFromClues(clueData);

    if (positionSets.length && clueData.size) {
      positionSets.forEach((letterSet, index) => {
        const card = document.createElement("article");
        card.className = "possible-card";

        const heading = document.createElement("div");
        heading.className = "possible-card-head";
        heading.innerHTML = `<span>الموضع ${index + 1}</span><span>${letterSet.size} حرف</span>`;

        const chips = document.createElement("div");
        chips.className = "possible-chips";

        const sortedLetters = Array.from(letterSet)
          .map((letter) => normalizeClueLetter(letter))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "ar"));
        if (!sortedLetters.length) {
          const empty = document.createElement("span");
          empty.className = "possible-empty";
          empty.textContent = "لا توجد بيانات بعد";
          chips.appendChild(empty);
        } else {
          sortedLetters.forEach((letter) => {
            const chip = document.createElement("span");
            chip.className = "possible-chip";
            chip.textContent = letter;
            chips.appendChild(chip);
          });
        }

        card.appendChild(heading);
        card.appendChild(chips);
        elements.possiblePositions.appendChild(card);
      });
    }
  }
}

function getRemainingCandidates() {
  return state.answers.filter((candidate) => {
    return state.attempts.every((attempt) => {
      const evaluation = evaluateGuess(attempt.guess, candidate);
      return evaluation.every((status, index) => status === attempt.evaluation[index]);
    });
  });
}

function collectProgressClueData() {
  const clueData = new Map();

  const ensureEntry = (normalized, display) => {
    if (!clueData.has(normalized)) {
      clueData.set(normalized, {
        display,
        fixedPositions: new Set(),
        bannedPositions: new Set(),
      });
      return clueData.get(normalized);
    }

    const entry = clueData.get(normalized);
    if (display && entry.display !== display) {
      entry.display = display;
    }
    return entry;
  };

  state.attempts.forEach((attempt) => {
    Array.from(attempt.guess).forEach((char, index) => {
      const normalized = normalizeArabic(char);
      const status = attempt.evaluation[index];

      if (!normalized || char === "X") {
        return;
      }

      if (status === "correct") {
        const entry = ensureEntry(normalized, normalizeClueLetter(char));
        entry.fixedPositions.add(index);
        return;
      }

      if (status === "present") {
        const entry = ensureEntry(normalized, normalizeClueLetter(char));
        entry.bannedPositions.add(index);
      }
    });
  });

  state.revealedHints.forEach((char) => {
    const normalized = normalizeArabic(char);
    if (!normalized) {
      return;
    }
    ensureEntry(normalized, normalizeClueLetter(char));
  });

  return clueData;
}

function derivePositionSetsFromClues(clueData) {
  const positionSets = Array.from({ length: state.wordLength }, () => new Set());
  const clueEntries = Array.from(clueData.values());

  for (let index = 0; index < state.wordLength; index += 1) {
    clueEntries.forEach((entry) => {
      if (entry.fixedPositions.size) {
        if (entry.fixedPositions.has(index)) {
          positionSets[index].add(entry.display);
        }
        return;
      }

      if (!entry.bannedPositions.has(index)) {
        positionSets[index].add(entry.display);
      }
    });

    if (positionSets[index].size > 1) {
      const fixedEntry = clueEntries.find((entry) => entry.fixedPositions.has(index));
      if (fixedEntry) {
        positionSets[index].clear();
        positionSets[index].add(fixedEntry.display);
      }
    }
  }

  return positionSets;
}

function normalizeClueLetter(letter) {
  const normalized = normalizeArabic(letter);
  if (!normalized) {
    return "";
  }

  if (/[أإآٱ]/.test(letter)) {
    return "ا";
  }
  if (letter === "ؤ") {
    return "و";
  }
  if (letter === "ى" || letter === "ئ") {
    return "ي";
  }

  return normalized;
}

function bindEvents() {
  document.addEventListener("keydown", handlePhysicalKeyboard);
  window.addEventListener("resize", resizeCelebrationCanvas);
  elements.board.addEventListener("click", handleBoardClick);
  elements.keyboard.addEventListener("click", handleKeyboardClick);
  elements.hintButton.addEventListener("click", revealHint);
  elements.resetButton.addEventListener("click", resetRound);
}

function handleBoardClick(event) {
  const tile = event.target.closest(".tile.selectable-placeholder");
  if (!tile || state.finished) {
    return;
  }

  const index = Number(tile.dataset.placeholderIndex);
  if (!Number.isInteger(index)) {
    return;
  }

  state.selectedPlaceholderIndex = index;
  renderBoard();
  persistState();
}

function handleKeyboardClick(event) {
  const button = event.target.closest("button[data-key]");
  if (!button) {
    return;
  }

  const key = button.dataset.key;
  if (key === "ENTER") {
    submitGuess();
    return;
  }
  if (key === "⌫") {
    removeLetter();
    return;
  }
  addLetter(key);
}

function handlePhysicalKeyboard(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitGuess();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    removeLetter();
    return;
  }

  if (event.key.length !== 1) {
    return;
  }

  if (event.key === "x" || event.key === "X") {
    event.preventDefault();
    addLetter("X");
    return;
  }

  const mapped = normalizeKeyboardInput(event.key);
  if (!mapped) {
    return;
  }

  event.preventDefault();
  addLetter(mapped);
}

function normalizeKeyboardInput(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const mappedFromEnglish = ENGLISH_TO_ARABIC_KEY_MAP[trimmed.toLowerCase()];
  if (mappedFromEnglish) {
    return mappedFromEnglish;
  }

  const normalized = normalizeArabic(trimmed);
  return Array.from(normalized).length === 1 ? normalized : "";
}

function addLetter(letter) {
  if (state.finished) {
    showToast("انتهت الجولة. يمكنك بدء جولة جديدة.");
    return;
  }

  if (state.selectedPlaceholderIndex !== null && replaceSelectedPlaceholder(letter)) {
    state.selectedPlaceholderIndex = null;
    renderBoard();
    persistState();
    return;
  }

  const currentLength = Array.from(state.currentGuess).length;
  const nextLength = Array.from(letter).length;
  if (currentLength + nextLength > state.wordLength) {
    return;
  }

  state.currentGuess += letter;
  renderBoard();
  persistState();
}

function removeLetter() {
  if (!state.currentGuess || state.finished) {
    return;
  }

  const letters = Array.from(state.currentGuess);
  letters.pop();
  state.currentGuess = letters.join("");
  state.selectedPlaceholderIndex = null;
  renderBoard();
  persistState();
}

function replaceSelectedPlaceholder(letter) {
  const letters = Array.from(state.currentGuess);
  const index = state.selectedPlaceholderIndex;
  if (!Number.isInteger(index) || index < 0 || index >= letters.length) {
    return false;
  }
  if (Array.from(letter).length !== 1) {
    return false;
  }

  letters[index] = letter;
  state.currentGuess = letters.join("");
  return true;
}

function submitGuess() {
  if (state.finished) {
    return;
  }

  const guessLetters = Array.from(state.currentGuess);
  if (guessLetters.length !== state.wordLength) {
    showToast(`أدخل كلمة من ${state.wordLength} أحرف`);
    return;
  }
  if (guessLetters.includes("X")) {
    showToast("استبدل X بحرف قبل الإرسال");
    return;
  }

  const normalizedGuess = normalizeArabic(state.currentGuess);
  if (!isAllowedGuess(state.currentGuess, normalizedGuess)) {
    showToast("هذه الكلمة غير موجودة في القائمة");
    return;
  }

  const evaluation = evaluateGuess(state.currentGuess, state.answer);
  state.attempts.push({ guess: state.currentGuess, evaluation });
  mergeKeyboardState(state.currentGuess, evaluation);
  state.currentGuess = "";
  state.selectedPlaceholderIndex = null;
  state.finished =
    evaluation.every((item) => item === "correct") || state.attempts.length >= state.maxAttempts;

  renderBoard();
  renderKeyboard();
  renderResultBanner();
  renderPossibilityPanel();
  persistState();

  if (evaluation.every((item) => item === "correct")) {
    playSoftCombo();
    showToast("أحسنت! تم حل الكلمة.");
  } else if (state.finished) {
    showToast(`انتهت المحاولات. الكلمة كانت: ${state.answer}`);
  }
}

function revealHint() {
  if (state.finished) {
    showToast("الجولة انتهت. ابدأ جولة جديدة.");
    return;
  }
  if (state.hintsUsed >= state.maxHints) {
    showToast("استخدمت كل التلميحات");
    return;
  }

  const answerLetters = Array.from(new Set(Array.from(state.answer).map((char) => normalizeArabic(char))));
  const guessedLetters = new Set();
  state.attempts.forEach((attempt) => {
    Array.from(attempt.guess).forEach((char) => {
      if (char !== "X") {
        guessedLetters.add(normalizeArabic(char));
      }
    });
  });
  Array.from(state.currentGuess).forEach((char) => {
    if (char !== "X") {
      guessedLetters.add(normalizeArabic(char));
    }
  });

  const remaining = answerLetters.filter(
    (char) => !state.revealedHints.includes(char) && !guessedLetters.has(char),
  );
  if (!remaining.length) {
    showToast("لا يوجد تلميح جديد غير الحروف التي خمنتها");
    return;
  }

  const randomIndex = Math.floor(Math.random() * remaining.length);
  const hint = remaining[randomIndex];
  state.revealedHints.push(hint);
  state.hintsUsed += 1;
  renderHints();
  persistState();
  showToast(`تلميح: الحرف ${hint} موجود في الكلمة`);
}

function isAllowedGuess(guess, normalizedGuess) {
  return (
    Array.from(guess).length === state.wordLength &&
    Array.from(normalizedGuess).length === state.wordLength &&
    (state.allowedGuesses.has(guess) || state.normalizedAllowedGuesses.has(normalizedGuess))
  );
}

function evaluateGuess(guess, answer) {
  const guessChars = Array.from(guess);
  const answerChars = Array.from(answer);
  const result = new Array(answerChars.length).fill("absent");
  const remaining = new Map();

  answerChars.forEach((char, index) => {
    const normalizedAnswerChar = normalizeArabic(char);
    const normalizedGuessChar = normalizeArabic(guessChars[index] ?? "");

    if (normalizedAnswerChar === normalizedGuessChar) {
      result[index] = "correct";
      return;
    }

    remaining.set(normalizedAnswerChar, (remaining.get(normalizedAnswerChar) ?? 0) + 1);
  });

  guessChars.forEach((char, index) => {
    if (result[index] === "correct") {
      return;
    }

    const normalizedChar = normalizeArabic(char);
    const available = remaining.get(normalizedChar) ?? 0;
    if (available > 0) {
      result[index] = "present";
      remaining.set(normalizedChar, available - 1);
    }
  });

  return result;
}

function mergeKeyboardState(guess, evaluation) {
  Array.from(guess).forEach((char, index) => {
    const nextStatus = evaluation[index];
    const currentStatus = state.keyboardState[char] ?? "empty";

    if (STATUS_PRIORITY[nextStatus] > STATUS_PRIORITY[currentStatus]) {
      state.keyboardState[char] = nextStatus;
    }
  });
}

function normalizeArabic(value) {
  const settings = state.config?.normalization ?? {};
  let result = String(value ?? "");

  if (settings.removeDiacritics) {
    result = result.replace(/[\u064B-\u065F\u0670]/g, "");
  }

  if (settings.removeTatweel) {
    result = result.replace(/\u0640/g, "");
  }

  if (settings.normalizeAlef) {
    result = result.replace(/[أإآٱ]/g, "ا");
  }

  if (settings.normalizeYa) {
    result = result.replace(/[ىئ]/g, "ي");
  }

  result = result.replace(/ؤ/g, "و");

  if (settings.normalizeTaMarbuta) {
    result = result.replace(/ة/g, "ه");
  }

  return result.replace(/[^\u0621-\u064A]/g, "");
}

function updateAttemptCounter() {
}

function renderHints() {
  const left = state.maxHints - state.hintsUsed;
  elements.hintButton.textContent = `تلميح (${left})`;
  elements.hintButton.disabled = left <= 0 || state.finished;

  if (!state.revealedHints.length) {
    elements.hintDisplay.textContent = "التلميحات: -";
    return;
  }

  elements.hintDisplay.textContent = `الحروف المكشوفة: ${state.revealedHints.join(" - ")}`;
}

function renderResultBanner() {
  elements.resultBanner.classList.remove("show", "win", "lose");
  elements.resultBanner.textContent = "";

  if (!state.finished) {
    return;
  }

  const won = state.attempts.at(-1)?.evaluation?.every((item) => item === "correct");
  elements.resultBanner.classList.add("show", won ? "win" : "lose");
  elements.resultBanner.textContent = won
    ? "ممتاز! تم حل الكلمة."
    : `انتهت المحاولات. الكلمة كانت: ${state.answer}`;
}

let toastTimer = null;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}

function resetRound() {
  stopSoftCombo();
  safeStorageRemove(storageKey());
  const nextPuzzle = pickPuzzle();
  saveActivePuzzle(nextPuzzle);
  applyPuzzle(nextPuzzle);
  state.attempts = [];
  state.currentGuess = "";
  state.selectedPlaceholderIndex = null;
  state.keyboardState = {};
  state.finished = false;
  state.hintsUsed = 0;
  state.revealedHints = [];
  renderBoard();
  renderKeyboard();
  renderHints();
  renderResultBanner();
  renderPossibilityPanel();
  updateAttemptCounter();
  persistState();
  showToast("بدأت جولة جديدة");
}



let celebrationFrame = null;
let celebrationParticles = [];
let celebrationFlashTimer = null;
let celebrationBounceTimer = null;

function resizeCelebrationCanvas() {
  const canvas = elements.celebrationCanvas;
  if (!canvas) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function randomCelebrationColor() {
  const palette = [
    "#ffd84d",
    "#ff7ab6",
    "#7dd3fc",
    "#8bffb7",
    "#c79bff",
    "#ffffff",
    "#ff9f43"
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function stopSoftCombo() {
  if (celebrationFrame) {
    cancelAnimationFrame(celebrationFrame);
    celebrationFrame = null;
  }

  celebrationParticles = [];
  clearTimeout(celebrationFlashTimer);
  clearTimeout(celebrationBounceTimer);
  document.body.classList.remove("flash-overlay");

  const boardPanel = document.querySelector(".board-panel");
  if (boardPanel) {
    boardPanel.classList.remove("board-bounce");
  }

  const canvas = elements.celebrationCanvas;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function triggerSoftComboFlash() {
  document.body.classList.remove("flash-overlay");
  void document.body.offsetWidth;
  document.body.classList.add("flash-overlay");
  celebrationFlashTimer = setTimeout(() => {
    document.body.classList.remove("flash-overlay");
  }, 650);
}

function triggerSoftComboBounce() {
  return;
}

function makeSoftComboSparkles(count = 180) {
  const particles = [];
  const width = window.innerWidth;

  for (let i = 0; i < count; i += 1) {
    particles.push({
      kind: "dot",
      x: Math.random() * width,
      y: -10 - Math.random() * 260,
      vx: (Math.random() - 0.5) * 2.2,
      vy: 1.2 + Math.random() * 2.2,
      gravity: 0.012,
      size: 1.4 + Math.random() * 3.2,
      rotation: 0,
      spin: 0,
      life: 1,
      decay: 0.004 + Math.random() * 0.005,
      color: randomCelebrationColor(),
    });
  }

  return particles;
}

function makeSoftComboConfetti(count = 95) {
  const particles = [];
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (let i = 0; i < count; i += 1) {
    particles.push({
      kind: "line",
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.18,
      vx: (Math.random() - 0.5) * 5.8,
      vy: 1.2 + Math.random() * 3.2,
      gravity: 0.05 + Math.random() * 0.035,
      size: 5 + Math.random() * 5.5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.18,
      life: 1,
      decay: 0.006 + Math.random() * 0.004,
      color: randomCelebrationColor(),
    });
  }

  return particles;
}

function makeSoftComboBursts(count = 22) {
  const particles = [];
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (let i = 0; i < count; i += 1) {
    const centerX = width * (0.12 + Math.random() * 0.76);
    const centerY = height * (0.12 + Math.random() * 0.35);
    const spokes = 10 + Math.floor(Math.random() * 8);

    for (let s = 0; s < spokes; s += 1) {
      const angle = (Math.PI * 2 * s) / spokes + Math.random() * 0.18;
      const speed = 1.8 + Math.random() * 3.8;
      particles.push({
        kind: "burst",
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.018 + Math.random() * 0.02,
        size: 1.8 + Math.random() * 2.8,
        rotation: angle,
        spin: 0,
        life: 1,
        decay: 0.012 + Math.random() * 0.009,
        color: randomCelebrationColor(),
      });
    }
  }

  return particles;
}

function animateSoftCombo() {
  const canvas = elements.celebrationCanvas;
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  celebrationParticles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += particle.gravity;
    particle.life -= particle.decay;
    particle.rotation += particle.spin;

    if (particle.kind === "line") {
      ctx.save();
      ctx.globalAlpha = Math.max(particle.life, 0);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.shadowBlur = 14;
      ctx.shadowColor = particle.color;
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size * 0.5, -particle.size * 1.4, particle.size, particle.size * 2.8);
      ctx.restore();
    } else if (particle.kind === "burst") {
      ctx.save();
      ctx.globalAlpha = Math.max(particle.life, 0);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.shadowBlur = 18;
      ctx.shadowColor = particle.color;
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size * 0.4, -particle.size * 2.8, particle.size * 0.8, particle.size * 5.6);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = Math.max(particle.life, 0);
      ctx.shadowBlur = 16;
      ctx.shadowColor = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();
      ctx.restore();
    }
  });

  celebrationParticles = celebrationParticles.filter((particle) => particle.life > 0);

  if (celebrationParticles.length > 0) {
    celebrationFrame = requestAnimationFrame(animateSoftCombo);
  } else {
    celebrationFrame = null;
  }
}

function playSoftCombo() {
  stopSoftCombo();
  resizeCelebrationCanvas();
  triggerSoftComboFlash();
  celebrationParticles = [
    ...makeSoftComboSparkles(),
    ...makeSoftComboConfetti(),
    ...makeSoftComboBursts(),
  ];
  animateSoftCombo();
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("Storage read failed", error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Storage write failed", error);
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Storage remove failed", error);
  }
}
