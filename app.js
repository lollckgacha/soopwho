// =========================================================
// SOOP WHO ARE YA? — 숲 스트리머 스무고개 퀴즈
// 데이터는 Google 스프레드시트 -> Apps Script -> Firebase RTDB 경로로 동기화된다.
// (apps_script_who_are_ya.gs 참고, 경로: soop_who)
// =========================================================

const FIREBASE_URL = "https://dongpa2026-2fda5-default-rtdb.asia-southeast1.firebasedatabase.app/";
const DATA_PATH = "soop_who.json";
const STORAGE_KEY = "soopWhoAreYa.v1";
const STATS_KEY = "soopWhoAreYa.stats.v1";
const VOLUME_KEY = "soopWhoAreYa.volume";

let streamers = [];
let target = null;
let guessedNames = [];
let crewImageByName = {}; // 크루명 -> 이미지 경로 (대표 크루가 아닌 다른 소속 크루를 힌트로 보여줄 때 필요)
let isTutorial = false;
let tutorialStepIndex = 0;
let volume = 70; // 사운드 볼륨 (bindEvents() -> initSound() 에서 곧바로 참조하므로 맨 위에서 선언해야 한다)
let audioCtx = null;

const $ = (sel) => document.querySelector(sel);

// 화면
const homeScreenEl = $("#homeScreen");
const statsScreenEl = $("#statsScreen");
const gameScreenEl = $("#gameScreen");

// 메인 화면
const startGameBtn = $("#startGameBtn");
const tutorialBtn = $("#tutorialBtn");
const statsBtn = $("#statsBtn");
const settingsBtn = $("#settingsBtn");
const settingsPopoverEl = $("#settingsPopover");
const homeVolumeSliderEl = $("#homeVolumeSlider");
const homeVolumeIconEl = $("#homeVolumeIcon");

// 상단바 (게임/통계 화면 공용)
const homeBtn = $("#homeBtn");
const statsHomeBtn = $("#statsHomeBtn");
const soundBtn = $("#soundBtn");
const volumePopoverEl = $("#volumePopover");
const volumeSliderEl = $("#volumeSlider");
const volumeIconEl = $("#volumeIcon");
const bgmEl = $("#bgmAudio");

// 튜토리얼
const tutorialTitleEl = $("#tutorialTitle");
const tutorialBannerEl = $("#tutorialBanner");
const tutorialTextEl = $("#tutorialText");
const tutorialNextBtn = $("#tutorialNextBtn");
const tutorialSkipBtn = $("#tutorialSkipBtn");

// 통계 화면
const statTotalWinsEl = $("#statTotalWins");
const statAverageEl = $("#statAverage");
const statBestEl = $("#statBest");
const statsChartEl = $("#statsChart");
const statsEmptyEl = $("#statsEmpty");
const resetStatsBtn = $("#resetStatsBtn");

// 게임 화면
const loadingEl = $("#loading");
const gameEl = $("#game");
const guessBoxEl = $("#guessBox");
const inputEl = $("#guessInput");
const submitBtn = $("#submitBtn");
const suggestionsEl = $("#suggestions");
const boardBodyEl = $("#boardBody");
const guessCountEl = $("#guessCount");
const shuffleBtn = $("#shuffleBtn");
const giveupBtn = $("#giveupBtn");
const resultPanelEl = $("#resultPanel");
const resultTextEl = $("#resultText");
const playAgainBtn = $("#playAgainBtn");
const stationLinkBtn = $("#stationLinkBtn");
const revealPhotoEl = $("#revealPhoto");
const revealNameEl = $("#revealName");

// ---------------------------------------------------------
// 데이터 로드 (페이지 열리면 바로 백그라운드에서 시작, 화면 전환과 무관하게 진행)
// ---------------------------------------------------------
let dataLoadFailed = false;
const dataLoadPromise = loadStreamerData();

async function loadStreamerData() {
  try {
    const res = await fetch(FIREBASE_URL + DATA_PATH, { cache: "no-store" });
    const data = await res.json();
    streamers = (data && data.streamers) || [];

    crewImageByName = {};
    ((data && data.crews) || []).forEach((c) => {
      if (c && c.name) crewImageByName[c.name] = c.image || "";
    });
  } catch (e) {
    dataLoadFailed = true;
    console.error(e);
  }
}

bindEvents();

// ---------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------
function showScreen(name) {
  homeScreenEl.classList.add("hidden");
  statsScreenEl.classList.add("hidden");
  gameScreenEl.classList.add("hidden");
  if (name === "home") homeScreenEl.classList.remove("hidden");
  if (name === "stats") statsScreenEl.classList.remove("hidden");
  if (name === "game") gameScreenEl.classList.remove("hidden");
}

function goHome() {
  isTutorial = false;
  hideTutorialUI();
  showScreen("home");
}

async function runInGameScreen(startFn) {
  showScreen("game");
  loadingEl.classList.remove("hidden");
  gameEl.classList.add("hidden");

  await dataLoadPromise;

  if (!streamers.length) {
    loadingEl.textContent = dataLoadFailed
      ? "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
      : "등록된 스트리머 데이터가 없습니다. 스프레드시트에서 전송해주세요.";
    return;
  }

  loadingEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  startFn();
}

function enterRealGame() {
  isTutorial = false;
  hideTutorialUI();
  runInGameScreen(() => restoreOrStartNewGame());
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
  resetReveal();
  showRoundInProgress();
  inputEl.value = "";
  saveState();
  inputEl.focus();
}

// 라운드 진행 중 UI 상태 (입력창 보이기, 결과 패널 숨기기)
function showRoundInProgress() {
  resultPanelEl.classList.add("hidden");
  guessBoxEl.classList.remove("hidden");
  giveupBtn.classList.remove("hidden");
  inputEl.disabled = false;
  submitBtn.disabled = false;
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
        if (s) {
          renderGuessRow(s);
          guessedNames.push(s.name);
        }
      });
      updateGuessCount();
      if (saved.won) {
        showWin();
      } else {
        showRoundInProgress();
      }
      return;
    }
  }
  startNewGame();
}

function saveState() {
  if (isTutorial) return; // 튜토리얼 진행 상황은 실제 게임 저장 데이터에 영향 주지 않는다
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
  // 메인 화면
  startGameBtn.addEventListener("click", enterRealGame);
  tutorialBtn.addEventListener("click", startTutorial);
  statsBtn.addEventListener("click", () => {
    renderStats();
    showScreen("stats");
  });

  // 상단바
  homeBtn.addEventListener("click", goHome);
  statsHomeBtn.addEventListener("click", goHome);

  // 통계
  resetStatsBtn.addEventListener("click", () => {
    if (confirm("통계를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) {
      saveStats({ counts: {} });
      renderStats();
    }
  });

  // 사운드 (게임 화면 상단바의 🔊 버튼)
  volumeSliderEl.addEventListener("input", () => {
    setVolume(Number(volumeSliderEl.value));
  });
  soundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    volumePopoverEl.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!volumePopoverEl.contains(e.target) && e.target !== soundBtn) {
      volumePopoverEl.classList.add("hidden");
    }
  });

  // 메인 화면의 ⚙️ 설정 버튼 (같은 음량을 조절)
  homeVolumeSliderEl.addEventListener("input", () => {
    setVolume(Number(homeVolumeSliderEl.value));
  });
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPopoverEl.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!settingsPopoverEl.contains(e.target) && e.target !== settingsBtn) {
      settingsPopoverEl.classList.add("hidden");
    }
  });

  // 튜토리얼 배너
  tutorialNextBtn.addEventListener("click", advanceTutorial);
  tutorialSkipBtn.addEventListener("click", goHome);

  // 게임 화면
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

  initSound();
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
    playBuzz();
    return;
  }
  if (guessedNames.includes(streamer.name)) {
    shakeInput();
    playBuzz();
    return;
  }

  guessedNames.push(streamer.name);
  renderGuessRow(streamer);
  updateGuessCount();
  inputEl.value = "";
  suggestionsEl.classList.add("hidden");
  saveState();

  if (isTutorial && tutorialStepIndex === 0) {
    advanceTutorial();
  }

  if (streamer.name === target.name) {
    playSuccess();
    showWin();
  } else {
    playPop();
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

// 스트리머 객체에서 소속 크루 전체 목록을 뽑아낸다 (crewNames가 없으면 대표 크루 하나만 사용,
// 옛 형식 데이터와도 호환)
function getCrewNames(streamer) {
  if (streamer.crewNames && streamer.crewNames.length) return streamer.crewNames;
  return streamer.crewName ? [streamer.crewName] : [];
}

// 추측한 스트리머와 정답 스트리머의 소속 크루를 비교한다.
// 대표 크루만 보는 게 아니라, 두 사람의 소속 크루 목록에 겹치는 크루가 하나라도 있으면
// 그 크루를 힌트로 보여준다 (대표 크루가 아니어도 상관없음).
// 예: 한결(대표=이브닛, 소속=이브닛/단코한끼) 추측 시 정답이 단코한끼 소속(코렛트)이면
//     이브닛이 아니라 단코한끼가 일치 힌트로 표시된다.
function compareCrew(guessStreamer, targetStreamer) {
  const guessCrews = getCrewNames(guessStreamer);
  const targetCrews = getCrewNames(targetStreamer);

  if (guessCrews.length === 0 && targetCrews.length === 0) {
    return { crewName: "", match: true, unknown: true }; // 둘 다 무소속
  }

  const matchedCrew = guessCrews.find((c) => targetCrews.includes(c));
  if (matchedCrew) {
    return { crewName: matchedCrew, match: true, unknown: false };
  }

  return { crewName: guessCrews[0] || "", match: false, unknown: guessCrews.length === 0 };
}

// 힌트에 표시할 크루의 이미지를 구한다. 대표 크루면 스트리머 객체에 이미 있는 값을 쓰고,
// 대표가 아닌 다른 소속 크루라면 전체 크루 목록(crewImageByName)에서 찾아온다.
function resolveCrewImage(streamer, crewName) {
  if (!crewName) return "";
  if (crewName === streamer.crewName) return streamer.crewImage || "";
  return crewImageByName[crewName] || "";
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
  const crewCmp = compareCrew(streamer, target);
  const ageCmp = compareNumber(streamer.age, target.age);
  const fanCmp = compareNumber(streamer.fanCount, target.fanCount);

  row.appendChild(nameCell(streamer.name));
  row.appendChild(genderBadge(streamer.gender, genderCmp));
  row.appendChild(crewBadge(crewCmp.crewName, resolveCrewImage(streamer, crewCmp.crewName), crewCmp));
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
  guessBoxEl.classList.add("hidden");
  giveupBtn.classList.add("hidden");
  suggestionsEl.classList.add("hidden");

  resultTextEl.textContent = gaveUp
    ? `아쉽지만 정답은 "${target.name}" 였습니다. (${guessedNames.length}번 시도)`
    : `🎉 정답입니다! "${target.name}" (${guessedNames.length}번 시도)`;

  if (target.stationUrl) {
    stationLinkBtn.href = target.stationUrl;
    stationLinkBtn.classList.remove("hidden");
  } else {
    stationLinkBtn.classList.add("hidden");
  }

  resultPanelEl.classList.remove("hidden");

  revealTarget(target);

  if (!gaveUp && !isTutorial) {
    recordWin(guessedNames.length);
  }

  if (isTutorial) {
    showTutorialCompletion();
  }
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

// ---------------------------------------------------------
// 튜토리얼: 실제 게임 화면을 그대로 플레이하면서 안내 배너로 설명을 덧붙인다.
// ---------------------------------------------------------
const TUTORIAL_STEPS = [
  {
    text: "이 게임은 힌트를 보고 숲(SOOP) 스트리머를 맞히는 게임이에요. 아래 입력창에 스트리머 이름을 입력하고 '맞히기'를 눌러 첫 힌트를 확인해보세요!",
    highlight: () => guessBoxEl,
  },
  {
    text: "방금 나온 원(배지)들이 힌트예요! 파란 배경은 정답과 일치, 검정 배경은 불일치예요. 나이·애청자수 옆의 화살표(▲/▼)는 정답이 더 높은지 낮은지 알려줘요.",
    highlight: () => boardBodyEl,
  },
  {
    text: "소속 크루는 로고 이미지로 표시돼요 (이미지에 마우스를 올리면 크루 이름이 나와요). 이제 정답을 맞힐 때까지 계속 추측해보세요. 모르겠으면 '정답 보기'를 눌러도 돼요!",
    highlight: () => boardBodyEl,
  },
];

function pickTutorialTarget() {
  return (
    streamers.find((s) => s.age != null && s.fanCount != null && s.crewName && hasValidImagePath(s.crewImage)) ||
    streamers.find((s) => s.age != null && s.fanCount != null) ||
    streamers[0]
  );
}

function startTutorial() {
  isTutorial = true;
  tutorialStepIndex = 0;
  tutorialTitleEl.classList.remove("hidden");
  tutorialSkipBtn.textContent = "튜토리얼 종료";
  runInGameScreen(() => {
    startNewGame(pickTutorialTarget());
    showTutorialStep(0);
  });
}

function showTutorialStep(i) {
  clearHighlights();
  const step = TUTORIAL_STEPS[i];
  if (!step) {
    tutorialBannerEl.classList.add("hidden");
    return;
  }
  tutorialTextEl.textContent = step.text;
  tutorialBannerEl.classList.remove("hidden");
  // 첫 단계는 실제로 이름을 입력해봐야 넘어가므로 "다음" 버튼을 숨겨서 직접 플레이를 유도한다
  if (i === 0) {
    tutorialNextBtn.classList.add("hidden");
  } else {
    tutorialNextBtn.classList.remove("hidden");
    tutorialNextBtn.textContent = i === TUTORIAL_STEPS.length - 1 ? "알겠어요 👍" : "다음 →";
  }
  const el = step.highlight && step.highlight();
  if (el) el.classList.add("tutorial-highlight");
}

function advanceTutorial() {
  tutorialStepIndex++;
  showTutorialStep(tutorialStepIndex);
}

function showTutorialCompletion() {
  clearHighlights();
  tutorialTextEl.textContent = "🎉 튜토리얼을 완료했어요! 이제 실전에서 도전해보세요.";
  tutorialNextBtn.classList.add("hidden");
  tutorialSkipBtn.textContent = "🏠 메인으로";
  tutorialBannerEl.classList.remove("hidden");
}

function clearHighlights() {
  document.querySelectorAll(".tutorial-highlight").forEach((el) => el.classList.remove("tutorial-highlight"));
}

function hideTutorialUI() {
  tutorialTitleEl.classList.add("hidden");
  tutorialBannerEl.classList.add("hidden");
  clearHighlights();
}

// ---------------------------------------------------------
// 통계: 몇 번 시도로 맞혔는지 기록/집계
// ---------------------------------------------------------
function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : { counts: {} };
  } catch (e) {
    return { counts: {} };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    /* 무시 */
  }
}

function recordWin(guessCount) {
  const stats = loadStats();
  const key = String(guessCount);
  stats.counts[key] = (stats.counts[key] || 0) + 1;
  saveStats(stats);
}

function renderStats() {
  const stats = loadStats();
  const counts = stats.counts || {};
  const entries = Object.keys(counts)
    .map((k) => [Number(k), counts[k]])
    .filter(([, c]) => c > 0);
  const totalWins = entries.reduce((sum, [, c]) => sum + c, 0);

  if (totalWins === 0) {
    statTotalWinsEl.textContent = "0";
    statAverageEl.textContent = "-";
    statBestEl.textContent = "-";
    statsChartEl.innerHTML = "";
    statsEmptyEl.classList.remove("hidden");
    return;
  }
  statsEmptyEl.classList.add("hidden");

  const totalGuesses = entries.reduce((sum, [k, c]) => sum + k * c, 0);
  const average = totalGuesses / totalWins;
  const best = Math.min(...entries.map(([k]) => k));

  statTotalWinsEl.textContent = String(totalWins);
  statAverageEl.textContent = average.toFixed(1) + "회";
  statBestEl.textContent = best + "회";

  // 1~9회는 그대로, 10회 이상은 "10+"로 묶어서 표시
  const buckets = {};
  entries.forEach(([k, c]) => {
    const bucketKey = k >= 10 ? "10+" : String(k);
    buckets[bucketKey] = (buckets[bucketKey] || 0) + c;
  });
  const bucketOrder = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
  const maxCount = Math.max(...bucketOrder.map((b) => buckets[b] || 0), 1);

  statsChartEl.innerHTML = "";
  bucketOrder.forEach((b) => {
    const count = buckets[b] || 0;
    const col = document.createElement("div");
    col.className = "bar-col" + (count === 0 ? " empty" : "");

    const countEl = document.createElement("div");
    countEl.className = "bar-count";
    countEl.textContent = count > 0 ? String(count) : "";

    const bar = document.createElement("div");
    bar.className = "bar";
    const heightPct = count > 0 ? Math.max(6, Math.round((count / maxCount) * 100)) : 3;
    bar.style.height = heightPct + "%";

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = b + "회";

    col.appendChild(countEl);
    col.appendChild(bar);
    col.appendChild(label);
    statsChartEl.appendChild(col);
  });
}

// ---------------------------------------------------------
// 사운드: Web Audio API로 간단한 효과음을 직접 생성한다 (별도 음원 파일 불필요)
// (volume/audioCtx 변수는 파일 맨 위에서 선언됨)
// ---------------------------------------------------------
function initSound() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    if (saved !== null) volume = Number(saved);
  } catch (e) {
    /* 무시 */
  }
  updateVolumeIcon();
  applyBgmVolume();
  unlockBgmOnFirstInteraction();
}

function setVolume(v) {
  volume = Math.max(0, Math.min(100, v));
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch (e) {
    /* 무시 */
  }
  updateVolumeIcon();
  applyBgmVolume();
}

function updateVolumeIcon() {
  const icon = volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊";
  soundBtn.textContent = icon;
  volumeIconEl.textContent = icon;
  homeVolumeIconEl.textContent = icon;
  // 두 슬라이더(게임 화면 상단바 / 메인 화면 설정)가 항상 같은 값을 보여주도록 동기화
  volumeSliderEl.value = String(volume);
  homeVolumeSliderEl.value = String(volume);
}

// ---------------------------------------------------------
// 배경음악 (bgm.mp3) — 슬라이더의 볼륨을 그대로 따라간다.
// 브라우저 자동재생 정책 때문에 사용자가 페이지 어디든 처음 클릭/키 입력을 하기 전까지는
// 재생을 시작할 수 없으므로, 첫 상호작용 시점에 한 번만 재생을 시도한다.
// ---------------------------------------------------------
function applyBgmVolume() {
  if (!bgmEl) return;
  bgmEl.volume = volume / 100;
}

function unlockBgmOnFirstInteraction() {
  if (!bgmEl) return;

  const tryPlay = () => {
    bgmEl.play().catch(() => {
      /* 아직 사용자 상호작용이 없어서 막힌 경우 - 다음 상호작용에서 다시 시도됨 */
    });
  };

  tryPlay(); // 이미 상호작용이 있었거나 정책이 느슨한 브라우저라면 바로 재생됨

  const startOnce = () => {
    tryPlay();
    document.removeEventListener("click", startOnce, true);
    document.removeEventListener("keydown", startOnce, true);
  };
  // 캡처 단계(capture phase)에서 등록해야, 사운드/설정 버튼처럼 stopPropagation()을
  // 호출하는 요소를 사용자가 맨 처음 클릭하더라도 재생 시도가 확실히 실행된다.
  document.addEventListener("click", startOnce, true);
  document.addEventListener("keydown", startOnce, true);
}

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function playTone(freq, duration, type) {
  if (volume <= 0) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;

  const peak = (volume / 100) * 0.2; // 너무 크지 않게 최대 볼륨 제한
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playPop() {
  playTone(440, 0.12, "sine");
}

function playBuzz() {
  playTone(160, 0.18, "square");
}

function playSuccess() {
  playTone(523, 0.14, "sine");
  setTimeout(() => playTone(659, 0.14, "sine"), 100);
  setTimeout(() => playTone(784, 0.22, "sine"), 200);
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
