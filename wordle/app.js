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
  c: "و",
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
  infiniteTries: false,
  darkMode: false,
};

const elements = {
  title: document.querySelector("#app-title"),
  hintDisplay: document.querySelector("#hint-display"),
  resultBanner: document.querySelector("#result-banner"),
  board: document.querySelector("#board"),
  keyboard: document.querySelector("#keyboard"),
  toast: document.querySelector("#toast"),
  settingsButton: document.querySelector("#settings-button"),
  shareButton: document.querySelector("#share-button"),
  settingsModal: document.querySelector("#settings-modal"),
  settingsBackdrop: document.querySelector("#settings-backdrop"),
  settingsClose: document.querySelector("#settings-close"),
  infiniteTriesToggle: document.querySelector("#infinite-tries-toggle"),
  darkModeToggle: document.querySelector("#dark-mode-toggle"),
  hintButton: document.querySelector("#hint-button"),
  resetButton: document.querySelector("#reset-button"),
  possiblePanel: document.querySelector("#possible-panel"),
  possiblePositions: document.querySelector("#possible-positions"),
  confettiLayer: document.querySelector("#confetti-layer"),
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
  hydratePreferences();

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

  const rowsToRender = getBoardRowsToRender();
  for (let rowIndex = 0; rowIndex < rowsToRender; rowIndex += 1) {
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

  const letterRows = state.keyboardRows.map((row) =>
    row.filter((key) => key !== "ENTER" && key !== "⌫" && key !== "ؤ"),
  );
  if (letterRows.length) {
    letterRows[letterRows.length - 1] = [...letterRows[letterRows.length - 1], "⌦"];
  }
  const controlRow = ["ROW_DELETE", "X", "ENTER"];
  const rowsWithControls = [...letterRows, controlRow];
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
        rawKey === "ENTER"
          ? "إدخال"
          : rawKey === "ROW_DELETE"
              ? "حذف السطر"
              : rawKey === "⌫" || rawKey === "⌦"
                ? "⌦"
              : rawKey === "X"
                ? "X"
                : rawKey;

      if (rawKey === "X" || rawKey === "ENTER" || rawKey === "⌦" || rawKey === "ROW_DELETE") {
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
  elements.board.addEventListener("click", handleBoardClick);
  elements.keyboard.addEventListener("click", handleKeyboardClick);
  elements.settingsButton?.addEventListener("click", openSettingsModal);
  elements.shareButton?.addEventListener("click", shareToWhatsApp);
  elements.settingsClose?.addEventListener("click", closeSettingsModal);
  elements.settingsBackdrop?.addEventListener("click", closeSettingsModal);
  elements.infiniteTriesToggle?.addEventListener("change", handleInfiniteTriesToggle);
  elements.darkModeToggle?.addEventListener("change", handleDarkModeToggle);
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
  if (key === "⌫" || key === "⌦") {
    removeLetter();
    return;
  }
  if (key === "ROW_DELETE") {
    clearCurrentRow();
    return;
  }
  addLetter(key);
}

function handlePhysicalKeyboard(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (event.key === "Escape") {
    closeSettingsModal();
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

function clearCurrentRow() {
  if (!state.currentGuess || state.finished) {
    return;
  }

  state.currentGuess = "";
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
    evaluation.every((item) => item === "correct") ||
    (!state.infiniteTries && state.attempts.length >= state.maxAttempts);

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
  renderPossibilityPanel();
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

async function shareToWhatsApp() {
  try {
    const file = await createShareImageFile();
    if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: "وردل عربي",
        files: [file],
      });
      return;
    }
  } catch (error) {
    console.warn("Image share failed", error);
  }

  showToast("مشاركة الصورة غير مدعومة في هذا المتصفح.");
}

async function createShareImageFile() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const shareRows = getShareRowsForImage();
  const isDark = state.darkMode;
  const width = 600;
  const rowHeight = 68;
  const boardTop = 84;
  const height = boardTop + shareRows.length * rowHeight + 28;
  canvas.width = width;
  canvas.height = height;

  const bgTop = isDark ? "#10151d" : "#f4efe4";
  const bgBottom = isDark ? "#151b25" : "#f3ecdf";
  const cardBg = isDark ? "rgba(24, 30, 40, 0.96)" : "rgba(255, 250, 241, 0.96)";
  const textColor = isDark ? "#f3f6fb" : "#241912";
  const mutedColor = isDark ? "#b3bcc9" : "#6f5d54";
  const borderColor = isDark ? "rgba(182, 201, 230, 0.22)" : "rgba(62, 40, 26, 0.12)";
  const emptyFill = isDark ? "#24303d" : "#fffaf1";
  const emptyBorder = isDark ? "#415064" : "#d8c9b4";

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, bgTop);
  gradient.addColorStop(1, bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 28, cardBg, borderColor);

  const cellSize = 56;
  const rowGap = 8;
  const colGap = 8;
  const boardWidth = state.wordLength * cellSize + (state.wordLength - 1) * colGap;
  const boardLeft = Math.floor((width - boardWidth) / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 34px Segoe UI, Tahoma, sans-serif";

  shareRows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, colIndex) => {
      const visualIndex = row.cells.length - 1 - colIndex;
      const x = boardLeft + visualIndex * (cellSize + colGap);
      const y = boardTop + rowIndex * (cellSize + rowGap);
      drawRoundedRect(
        ctx,
        x,
        y,
        cellSize,
        cellSize,
        18,
        cell.fill,
        cell.stroke,
        2,
      );
      if (cell.text) {
        ctx.fillStyle = cell.textColor;
        ctx.fillText(cell.text, x + cellSize / 2, y + cellSize / 2 + 2);
      }
    });
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) {
    return null;
  }

  return new File([blob], "wordle-state.jpg", { type: "image/jpeg" });
}

function buildShareGrid() {
  if (!state.attempts.length) {
    return "";
  }

  return state.attempts
    .map((attempt) =>
      Array.from(attempt.evaluation)
        .map((status) => {
          if (status === "correct") return "🟩";
          if (status === "present") return "🟨";
          return "⬛";
        })
        .join(""),
    )
    .join("\n");
}

function getShareRowsForImage() {
  const attempts = state.attempts.slice(-6);
  const rows = attempts.map((attempt) => ({
    cells: Array.from(attempt.evaluation).map((status, index) => ({
      text: Array.from(attempt.guess)[index] ?? "",
      fill:
        status === "correct"
          ? getComputedStyle(document.documentElement).getPropertyValue("--correct").trim() || "#3e7b4f"
          : status === "present"
            ? getComputedStyle(document.documentElement).getPropertyValue("--present").trim() || "#c78b2a"
            : getComputedStyle(document.documentElement).getPropertyValue("--absent").trim() || "#8f8078",
      stroke: "transparent",
      textColor: "#ffffff",
    })),
  }));

  if (state.currentGuess) {
    const letters = Array.from(state.currentGuess);
    rows.push({
      cells: Array.from({ length: state.wordLength }, (_, index) => {
        const letter = letters[index] ?? "";
        return {
          text: letter,
          fill: letter ? "rgba(255,255,255,0.08)" : "transparent",
          stroke: getComputedStyle(document.documentElement).getPropertyValue("--empty").trim() || "#d8c9b4",
          textColor: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#241912",
        };
      }),
    });
  }

  return rows;
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke, strokeWidth = 0) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && strokeWidth) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function getBoardRowsToRender() {
  if (!state.infiniteTries) {
    return state.maxAttempts;
  }

  const activeRow = state.finished ? state.attempts.length : state.attempts.length + 1;
  return Math.max(state.maxAttempts, activeRow);
}

function openSettingsModal() {
  if (!elements.settingsModal) {
    return;
  }
  renderSettings();
  elements.settingsModal.hidden = false;
}

function closeSettingsModal() {
  if (!elements.settingsModal) {
    return;
  }
  elements.settingsModal.hidden = true;
}

function handleInfiniteTriesToggle(event) {
  state.infiniteTries = Boolean(event.target.checked);
  persistPreferences();

  const won = state.attempts.at(-1)?.evaluation?.every((item) => item === "correct");
  if (state.infiniteTries && state.finished && !won) {
    state.finished = false;
  } else if (!state.infiniteTries && !state.finished && state.attempts.length >= state.maxAttempts && !won) {
    state.finished = true;
  }

  renderBoard();
  renderKeyboard();
  renderHints();
  renderResultBanner();
  renderPossibilityPanel();
  persistState();
}

function handleDarkModeToggle(event) {
  state.darkMode = Boolean(event.target.checked);
  applyTheme();
  persistPreferences();
}

function isIndex2Page() {
  return document.body?.dataset?.page === "index2";
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









let winFlashTimer = null;
let confettiClearTimer = null;

function ensureConfettiLayer() {
  if (elements.confettiLayer && document.body.contains(elements.confettiLayer)) {
    return elements.confettiLayer;
  }

  let layer = document.getElementById("confetti-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "confetti-layer";
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  } else if (layer.parentElement !== document.body) {
    document.body.appendChild(layer);
  }

  elements.confettiLayer = layer;
  return layer;
}

function clearConfetti() {
  clearTimeout(confettiClearTimer);
  const layer = ensureConfettiLayer();
  if (layer) {
    layer.innerHTML = "";
  }
}

function spawnConfetti() {
  const layer = ensureConfettiLayer();
  if (!layer) {
    return;
  }

  clearConfetti();

  const colors = ["#ffd84d", "#ff7ab6", "#7dd3fc", "#8bffb7", "#c79bff", "#ffffff", "#ff9f43"];
  const count = window.innerWidth < 700 ? 70 : 110;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = `${8 + Math.random() * 6}px`;
    piece.style.height = `${12 + Math.random() * 10}px`;
    piece.style.borderRadius = `${2 + Math.random() * 4}px`;
    piece.style.setProperty("--drift-x", `${(Math.random() - 0.5) * 180}px`);
    piece.style.setProperty("--fall-rot", `${(Math.random() - 0.5) * 900}deg`);
    piece.style.animationDuration = `${2.3 + Math.random() * 1.2}s, ${0.5 + Math.random() * 0.5}s`;
    piece.style.animationDelay = `${Math.random() * 0.22}s, 0s`;
    piece.style.opacity = "0.98";
    layer.appendChild(piece);
  }

  confettiClearTimer = setTimeout(() => {
    if (layer) {
      layer.innerHTML = "";
    }
  }, 4200);
}

function stopSoftCombo() {
  clearTimeout(winFlashTimer);
  document.body.classList.remove("win-flash");
  clearConfetti();
}

function playSoftCombo() {
  stopSoftCombo();
  void document.body.offsetWidth;
  document.body.classList.add("win-flash");
  spawnConfetti();
  winFlashTimer = setTimeout(() => {
    document.body.classList.remove("win-flash");
  }, 920);
}

function preferencesKey() {
  return "wordl:preferences";
}

function hydratePreferences() {
  const raw = safeStorageGet(preferencesKey());
  if (!raw) {
    applyTheme();
    renderSettings();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.infiniteTries = Boolean(parsed?.infiniteTries);
    state.darkMode = Boolean(parsed?.darkMode);
  } catch (error) {
    console.warn("Ignoring invalid preferences", error);
  }

  applyTheme();
  renderSettings();
}

function persistPreferences() {
  safeStorageSet(
    preferencesKey(),
    JSON.stringify({
      infiniteTries: state.infiniteTries,
      darkMode: state.darkMode,
    }),
  );
  renderSettings();
}

function renderSettings() {
  if (elements.infiniteTriesToggle) {
    elements.infiniteTriesToggle.checked = state.infiniteTries;
  }
  if (elements.darkModeToggle) {
    elements.darkModeToggle.checked = state.darkMode;
  }
}

function applyTheme() {
  document.body.dataset.theme = state.darkMode ? "dark" : "light";
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
