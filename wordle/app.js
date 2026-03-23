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
  b: "لا",
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
  bindEvents();
}

function sanitizeWords(words) {
  return words
    .filter((word) => typeof word === "string")
    .map((word) => word.trim())
    .filter(Boolean);
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
    const raw = localStorage.getItem("wordl:active-puzzle");
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
  localStorage.setItem("wordl:active-puzzle", JSON.stringify(puzzle));
}

function hydrateSavedState() {
  const raw = localStorage.getItem(storageKey());
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
  localStorage.setItem(storageKey(), JSON.stringify(snapshot));
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

    for (let colIndex = 0; colIndex < state.wordLength; colIndex += 1) {
      const tile = document.createElement("div");
      const rawLetter = letters[colIndex] ?? "";
      const displayLetter = rawLetter === "X" ? "" : rawLetter;
      tile.className = "tile";
      tile.textContent = displayLetter;

      if (rawLetter) {
        tile.classList.add("filled");
      }
      if (rawLetter === "X") {
        tile.classList.add("placeholder-tile");
        if (rowIndex === state.attempts.length && !state.finished) {
          tile.classList.add("selectable-placeholder");
          tile.dataset.placeholderIndex = String(colIndex);
          if (state.selectedPlaceholderIndex === colIndex) {
            tile.classList.add("selected-placeholder");
          }
        }
      }

      if (statuses[colIndex]) {
        tile.classList.add(statuses[colIndex]);
      }

      row.appendChild(tile);
    }

    elements.board.appendChild(row);
  }
}

function renderKeyboard() {
  elements.keyboard.textContent = "";

  const rowsWithPlaceholder = [...state.keyboardRows, ["X"]];
  rowsWithPlaceholder.forEach((rowValues) => {
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

      if (rawKey === "ENTER" || rawKey === "⌫") {
        keyButton.classList.add("special");
      }
      if (rawKey === "X") {
        keyButton.classList.add("placeholder");
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

function bindEvents() {
  document.addEventListener("keydown", handlePhysicalKeyboard);
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

  if (trimmed === "ﻻ" || trimmed === "لا") {
    return "لا";
  }

  const normalized = normalizeArabic(trimmed);
  return Array.from(normalized).length === 1 ? normalized : "";
}

function addLetter(letter) {
  if (state.finished) {
    showToast("انتهت الجولة. يمكنك بدء جولة جديدة.");
    return;
  }

  if (state.selectedPlaceholderIndex !== null && letter !== "X" && replaceSelectedPlaceholder(letter)) {
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
  if (letters[index] !== "X") {
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
  persistState();

  if (evaluation.every((item) => item === "correct")) {
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
  const remaining = answerLetters.filter((char) => !state.revealedHints.includes(char));
  if (!remaining.length) {
    showToast("لا يوجد تلميحات إضافية");
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
  localStorage.removeItem(storageKey());
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
  updateAttemptCounter();
  persistState();
  showToast("بدأت جولة جديدة");
}
