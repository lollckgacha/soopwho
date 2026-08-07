// =========================================================
// SOOP WHO ARE YA? — 숲 스트리머 스무고개 퀴즈
// 데이터는 Google 스프레드시트 -> Apps Script -> Firebase RTDB 경로로 동기화된다.
// (apps_script_who_are_ya.gs 참고, 경로: soop_who)
// =========================================================

const FIREBASE_URL = "https://dongpa2026-2fda5-default-rtdb.asia-southeast1.firebasedatabase.app/";
const DATA_PATH = "soop_who.json";
const STORAGE_KEY = "soopWhoAreYa.v1";

let streamers = [];
let target = null;
let guessedNames = [];

const $ = (sel) => document.querySelector(sel);
const loadingEl = $("#loading");
const gameEl = $("#game");
const inputEl = $("#guessInput");
const submitBtn = $("#submitBtn");
const suggestionsEl = $("#suggestions");
const boardBodyEl = $("#boardBody");
const guessCountEl = $("#guessCount");
const shuffleBtn = $("#shuffleBtn");
const giveupBtn = $("#giveupBtn");
const winModal = $("#winModal");
const winText = $("#winText");
const winMeta = $("#winMeta");
const playAgainBtn = $("#playAgainBtn");
const revealPhotoEl = $("#revealPhoto");
const revealNameEl = $("#revealName");

init();

async function init() {
  try {
    const res = await fetch(FIREBASE_URL + DATA_PATH, { cache: "no-store" });
    const data = await res.json();
    streamers = (data && data.streamers) || [];
  } catch (e) {
    loadingEl.textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    console.error(e);
    return;
  }

  if (!streamers.length) {
    loadingEl.textContent = "등록된 스트리머 데이터가 없습니다. 스프레드시트에서 전송해주세요.";
    return;
  }

  loadingEl.classList.add("hidden");
  gameEl.classList.remove("hidden");

  restoreOrStartNewGame();
  bindEvents();
}

// ---------------------------------------------------------
// 게임 상태
// ---------------------------------------------------------
function pickRandomTarget(excludeName) {
  const pool = excludeName ? streamers.filter((s) => s.name !== excludeName) : streamers;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startNewGame(newTarget) {
  target = newTarget || pickRandomTarget();
  guessedNames = [];
  boardBodyEl.innerHTML = "";
  updateGuessCount();
  winModal.classList.add("hidden");
  resetReveal();
  inputEl.value = "";
  inputEl.disabled = false;
  submitBtn.disabled = false;
  saveState();
  inputEl.focus();
}

function restoreOrStartNewGame() {
  const saved = loadState();
  if (saved && saved.targetName) {
    const foundTarget = streamers.find((s) => s.name === saved.targetName);
    if (foundTarget) {
      target = foundTarget;
      guessedNames = [];
      boardBodyEl.innerHTML = "";
      resetReveal();
      (saved.guessedNames || []).forEach((name) => {
        const s = streamers.find((st) => st.name === name);
        if (s) renderGuessRow(s);
      });
      updateGuessCount();
      if (saved.won) {
        showWin();
      }
      return;
    }
  }
  startNewGame();
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        targetName: target ? target.name : null,
        guessedNames,
        won: guessedNames.includes(target ? target.name : ""),
      })
    );
  } catch (e) {
    /* localStorage 사용 불가 시 무시 */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------
// 이벤트 바인딩
// ---------------------------------------------------------
function bindEvents() {
  submitBtn.addEventListener("click", handleSubmit);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      moveSuggestionSelection(e.key === "ArrowDown" ? 1 : -1);
      e.preventDefault();
    }
  });
  inputEl.addEventListener("input", renderSuggestions);
  inputEl.addEventListener("focus", renderSuggestions);
  document.addEventListener("click", (e) => {
    if (!suggestionsEl.contains(e.target) && e.target !== inputEl) {
      suggestionsEl.classList.add("hidden");
    }
  });

  shuffleBtn.addEventListener("click", () => startNewGame(pickRandomTarget(target ? target.name : null)));
  giveupBtn.addEventListener("click", () => {
    if (!target) return;
    if (!guessedNames.includes(target.name)) {
      renderGuessRow(target);
      guessedNames.push(target.name);
      updateGuessCount();
      saveState();
    }
    showWin(true);
  });
  playAgainBtn.addEventListener("click", () => startNewGame(pickRandomTarget(target ? target.name : null)));
}

// ---------------------------------------------------------
// 자동완성
// ---------------------------------------------------------
let activeSuggestionIndex = -1;

function renderSuggestions() {
  const q = inputEl.value.trim().toLowerCase();
  suggestionsEl.innerHTML = "";
  activeSuggestionIndex = -1;

  if (!q) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  const matches = streamers
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  matches.forEach((s) => {
    const li = document.createElement("li");
    const used = guessedNames.includes(s.name);
    li.innerHTML = `<span>${escapeHtml(s.name)}</span>${used ? '<span class="used-tag">이미 시도함</span>' : ""}`;
    if (used) li.style.opacity = "0.5";
    li.addEventListener("click", () => {
      if (used) return;
      inputEl.value = s.name;
      suggestionsEl.classList.add("hidden");
      submitGuess(s.name);
    });
    suggestionsEl.appendChild(li);
  });

  suggestionsEl.classList.remove("hidden");
}

function moveSuggestionSelection(dir) {
  const items = Array.from(suggestionsEl.querySelectorAll("li"));
  if (!items.length) return;
  items.forEach((it) => it.classList.remove("active"));
  activeSuggestionIndex = (activeSuggestionIndex + dir + items.length) % items.length;
  items[activeSuggestionIndex].classList.add("active");
  items[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------
// 정답 제출
// ---------------------------------------------------------
function handleSubmit() {
  const activeLi = suggestionsEl.querySelector("li.active");
  if (activeLi && !suggestionsEl.classList.contains("hidden")) {
    submitGuess(activeLi.querySelector("span").textContent);
    return;
  }
  submitGuess(inputEl.value.trim());
}

function submitGuess(rawName) {
  const name = rawName.trim();
  if (!name) return;

  const streamer = streamers.find((s) => s.name === name);
  if (!streamer) {
    shakeInput();
    return;
  }
  if (guessedNames.includes(streamer.name)) {
    shakeInput();
    return;
  }

  guessedNames.push(streamer.name);
  renderGuessRow(streamer);
  updateGuessCount();
  inputEl.value = "";
  suggestionsEl.classList.add("hidden");
  saveState();

  if (streamer.name === target.name) {
    showWin();
  }
}

function shakeInput() {
  inputEl.classList.remove("shake");
  // reflow to restart animation
  void inputEl.offsetWidth;
  inputEl.classList.add("shake");
  setTimeout(() => inputEl.classList.remove("shake"), 400);
}

function updateGuessCount() {
  guessCountEl.textContent = `시도: ${guessedNames.length}회`;
}

// ---------------------------------------------------------
// 힌트 비교 로직
// ---------------------------------------------------------
function compareGender(guess, ans) {
  if (!guess || !ans) return { match: false, unknown: true };
  return { match: guess === ans, unknown: false };
}

function compareCrew(guess, ans) {
  const g = guess || "";
  const a = ans || "";
  if (!g && !a) return { match: true, unknown: true }; // 둘 다 무소속
  return { match: g === a, unknown: !g };
}

function compareNumber(guessVal, ansVal) {
  if (guessVal == null || ansVal == null) {
    return { match: false, unknown: true, direction: null };
  }
  if (guessVal === ansVal) return { match: true, unknown: false, direction: null };
  return { match: false, unknown: false, direction: guessVal < ansVal ? "up" : "down" };
}

function formatFanCount(n) {
  if (n == null) return "비공개";
  if (n >= 10000) return Math.floor(n / 10000) + "만";
  if (n >= 1000) return Math.floor(n / 1000) + "천";
  return String(n) + "명";
}

// ---------------------------------------------------------
// 렌더링
// ---------------------------------------------------------
function renderGuessRow(streamer) {
  const row = document.createElement("div");
  row.className = "board-row guess-row";

  const genderCmp = compareGender(streamer.gender, target.gender);
  const crewCmp = compareCrew(streamer.crewName, target.crewName);
  const ageCmp = compareNumber(streamer.age, target.age);
  const fanCmp = compareNumber(streamer.fanCount, target.fanCount);

  row.appendChild(nameCell(streamer.name));
  row.appendChild(genderBadge(streamer.gender, genderCmp));
  row.appendChild(crewBadge(streamer.crewName, streamer.crewImage, crewCmp));
  row.appendChild(numberBadge(streamer.age, ageCmp, (v) => `${v}세`));
  row.appendChild(numberBadge(streamer.fanCount, fanCmp, formatFanCount));

  boardBodyEl.prepend(row);
}

function nameCell(name) {
  const div = document.createElement("div");
  div.className = "cell cell-name";
  div.textContent = name;
  return div;
}

function genderSymbol(value) {
  if (value === "남") return "♂";
  if (value === "여") return "♀";
  return null;
}

function genderBadge(value, cmp) {
  const div = document.createElement("div");
  div.className = "cell";
  const badge = document.createElement("div");
  badge.className = "badge" + (cmp.unknown ? " unknown" : cmp.match ? " match" : "");
  const symbol = genderSymbol(value);
  if (symbol) {
    badge.classList.add("gender-symbol");
    badge.textContent = symbol;
  } else {
    badge.textContent = "비공개";
  }
  div.appendChild(badge);
  return div;
}

// crewImage가 실제 이미지 파일을 가리키는지 확인 ("crew/" 처럼 파일명이 없는
// 자리표시자 값은 무효로 취급한다)
function hasValidImagePath(path) {
  return !!path && /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(path);
}

function crewBadge(crewName, crewImage, cmp) {
  const div = document.createElement("div");
  div.className = "cell";
  const badge = document.createElement("div");
  badge.className = "badge badge-crew" + (cmp.unknown ? " unknown" : cmp.match ? " match" : "");

  function showFallback() {
    badge.innerHTML = "";
    badge.setAttribute("data-tooltip", crewName || "무소속");
    const span = document.createElement("span");
    span.className = crewName ? "no-crew text-fallback" : "no-crew";
    span.textContent = crewName ? crewName.slice(0, 2) : "❔";
    badge.appendChild(span);
  }

  if (crewName && hasValidImagePath(crewImage)) {
    badge.setAttribute("data-tooltip", crewName);
    const img = document.createElement("img");
    img.src = crewImage;
    img.alt = crewName;
    img.onerror = showFallback; // 이미지 파일이 실제로 없으면(404) 텍스트로 대체
    badge.appendChild(img);
  } else {
    showFallback();
  }

  div.appendChild(badge);
  return div;
}

function numberBadge(value, cmp, formatter) {
  const div = document.createElement("div");
  div.className = "cell";
  const badge = document.createElement("div");
  badge.className = "badge" + (cmp.unknown ? " unknown" : cmp.match ? " match" : "");

  if (cmp.unknown) {
    badge.textContent = "비공개";
  } else {
    const valueSpan = document.createElement("span");
    valueSpan.textContent = formatter(value);
    badge.appendChild(valueSpan);
    if (cmp.direction) {
      const arrow = document.createElement("span");
      arrow.className = "arrow " + cmp.direction;
      arrow.textContent = cmp.direction === "up" ? "▲" : "▼";
      badge.appendChild(arrow);
    }
  }

  div.appendChild(badge);
  return div;
}

function showWin(gaveUp) {
  inputEl.disabled = true;
  submitBtn.disabled = true;
  winText.textContent = gaveUp
    ? `아쉽지만 정답은 "${target.name}" 였습니다.`
    : `정답은 "${target.name}" 였습니다! (${guessedNames.length}번 시도)`;
  winMeta.textContent = target.stationUrl ? target.stationUrl : "";
  winModal.classList.remove("hidden");
  revealTarget(target);
}

// ---------------------------------------------------------
// 상단 "?" -> 정답 스트리머 사진 공개
// ---------------------------------------------------------
function resetReveal() {
  revealPhotoEl.classList.remove("solved");
  revealPhotoEl.innerHTML = '<span class="reveal-mark">?</span>';
  revealNameEl.classList.add("hidden");
  revealNameEl.textContent = "";
}

function revealTarget(streamer) {
  revealPhotoEl.classList.add("solved");
  revealNameEl.textContent = streamer.name;
  revealNameEl.classList.remove("hidden");

  function showInitial() {
    revealPhotoEl.innerHTML =
      '<span class="reveal-initial">' + escapeHtml(streamer.name.slice(0, 1)) + "</span>";
  }

  if (streamer.photo) {
    const img = document.createElement("img");
    img.src = streamer.photo;
    img.alt = streamer.name;
    img.onerror = showInitial; // 이미지 주소가 없거나 깨져 있으면 이름 첫 글자로 대체
    revealPhotoEl.innerHTML = "";
    revealPhotoEl.appendChild(img);
  } else {
    showInitial();
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
