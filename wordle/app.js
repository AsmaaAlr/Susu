const DATA_PATHS = {
  config: "./config/game-config-ar.json",
  keyboard: "./config/keyboard-layout-ar.json",
  answers: "./data/answers-ar.json",
  allowedGuesses: "./data/allowed-guesses-ar.json",
};

const STATUS_PRIORITY = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
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
  keyboardState: {},
  maxAttempts: 6,
  finished: false,
};

const elements = {
  title: document.querySelector("#app-title"),
  board: document.querySelector("#board"),
  keyboard: document.querySelector("#keyboard"),
  toast: document.querySelector("#toast"),
  shareButton: document.querySelector("#share-button"),
  resetButton: document.querySelector("#reset-button"),
};

init().catch((error) => {
  console.error(error);
  showToast("تعذر تحميل البيانات");
});

async function init() {
  const [configData, keyboardData, answersData, allowedData] = await Promise.all([
    fetchJson(DATA_PATHS.config),
    fetchJson(DATA_PATHS.keyboard),
    fetchJson(DATA_PATHS.answers),
    fetchJson(DATA_PATHS.allowedGuesses),
  ]);

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
  bindEvents();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.json();
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
    state.keyboardState = saved.keyboardState && typeof saved.keyboardState === "object" ? saved.keyboardState : {};
    state.finished = Boolean(saved.finished);
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
    keyboardState: state.keyboardState,
    finished: state.finished,
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
      tile.className = "tile";
      tile.textContent = letters[colIndex] ?? "";

      if (letters[colIndex]) {
        tile.classList.add("filled");
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

  state.keyboardRows.forEach((rowValues) => {
    const row = document.createElement("div");
    row.className = "keyboard-row";

    rowValues.forEach((rawKey) => {
      const keyButton = document.createElement("button");
      keyButton.type = "button";
      keyButton.className = "key";
      keyButton.dataset.key = rawKey;
      keyButton.textContent = rawKey === "ENTER" ? "إدخال" : rawKey === "⌫" ? "حذف" : rawKey;

      if (rawKey === "ENTER" || rawKey === "⌫") {
        keyButton.classList.add("special");
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
  elements.keyboard.addEventListener("click", handleKeyboardClick);
  elements.resetButton.addEventListener("click", resetRound);
  elements.shareButton.addEventListener("click", shareResult);
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
  renderBoard();
  persistState();
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

  const normalizedGuess = normalizeArabic(state.currentGuess);
  if (!isAllowedGuess(state.currentGuess, normalizedGuess)) {
    showToast("هذه الكلمة غير موجودة في القائمة");
    return;
  }

  const evaluation = evaluateGuess(state.currentGuess, state.answer);
  state.attempts.push({ guess: state.currentGuess, evaluation });
  mergeKeyboardState(state.currentGuess, evaluation);
  state.currentGuess = "";
  state.finished =
    evaluation.every((item) => item === "correct") || state.attempts.length >= state.maxAttempts;

  renderBoard();
  renderKeyboard();
  persistState();

  if (evaluation.every((item) => item === "correct")) {
    showToast("أحسنت! تم حل الكلمة.");
  } else if (state.finished) {
    showToast(`انتهت المحاولات. الكلمة كانت: ${state.answer}`);
  }
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

function formatArabicDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ar-KW", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
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
  state.keyboardState = {};
  state.finished = false;
  renderBoard();
  renderKeyboard();
  updateAttemptCounter();
  persistState();
  showToast("بدأت جولة جديدة");
}

async function shareResult() {
  if (!state.attempts.length) {
    showToast("ابدأ جولة أولاً ثم شارك النتيجة");
    return;
  }

  const title = state.config?.appName || "كلمة اليوم";
  const score = state.attempts.at(-1)?.evaluation.every((item) => item === "correct")
    ? state.attempts.length
    : "X";
  const grid = state.attempts
    .map((attempt) =>
      attempt.evaluation
        .map((status) => {
          if (status === "correct") return "🟩";
          if (status === "present") return "🟨";
          return "⬜";
        })
        .join("")
    )
    .join("\n");

  const text = `${title} ${state.puzzle?.date} ${score}/${state.maxAttempts}\n${grid}`;
  const header = `${title} ${score}/${state.maxAttempts}`;
  const textToShare = `${header}\n${grid}`;

  try {
    if (navigator.share) {
      await navigator.share({ text: textToShare });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToShare);
      showToast("تم نسخ النتيجة");
      return;
    } else {
      throw new Error("No share support");
    }
    showToast("تمت مشاركة النتيجة");
  } catch (error) {
    console.warn("Share failed", error);
    showToast("تعذر مشاركة النتيجة");
  }
}
