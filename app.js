// =========================================================
// SOOP WHO ARE YA? — 숲 스트리머 스무고개 퀴즈
// 데이터는 Google 스프레드시트 -> Apps Script -> Firebase RTDB 경로로 동기화된다.
// (apps_script_who_are_ya.gs 참고, 경로: soop_who)
// =========================================================

const FIREBASE_URL = "https://dongpa2026-2fda5-default-rtdb.asia-southeast1.firebasedatabase.app/";
const DATA_PATH = "soop_who.json";
const STATS_KEY = "soopWhoAreYa.stats.v1";
const VOLUME_KEY = "soopWhoAreYa.volume";
const DAILY_KEY = "soopWhoAreYa.daily.v1";
const DAILY_ATTEMPT_LIMIT = 10;

// 출제 범위 슬라이더의 눈금들. 각 손잡이는 이 배열의 인덱스(0~13)를 값으로 갖는다.
// 간단한 버튼("2천▲" 등)은 결국 이 인덱스 두 개(min/max)를 지정하는 것과 같다.
const RANGE_STEPS = [
  { value: 0, label: "0" },
  { value: 500, label: "500" },
  { value: 1000, label: "1천" },
  { value: 2000, label: "2천" },
  { value: 3000, label: "3천" },
  { value: 5000, label: "5천" },
  { value: 7000, label: "7천" },
  { value: 10000, label: "1만" },
  { value: 15000, label: "1.5만" },
  { value: 20000, label: "2만" },
  { value: 30000, label: "3만" },
  { value: 50000, label: "5만" },
  { value: 100000, label: "10만" },
  { value: Infinity, label: "무제한" },
];
const RANGE_LAST_INDEX = RANGE_STEPS.length - 1;

let streamers = [];
let target = null;
let guessedNames = [];
let hintUseCount = 0; // "💡 힌트보기" 버튼을 이번 판에서 몇 번 썼는지 (횟수 제한은 없고, 쓸 때마다 시도 횟수에 더해짐)
let crewImageByName = {}; // 크루명 -> 이미지 경로 (대표 크루가 아닌 다른 소속 크루를 힌트로 보여줄 때 필요)
let isTutorial = false;
let isDailyChallenge = false; // 오늘의 일일 도전 라운드인지 (모두에게 같은 정답, 10회 제한)
let tutorialStepIndex = 0;
let currentRangeMin = 0; // 출제 범위 하한(포함), 0 = 제한 없음
let currentRangeMax = Infinity; // 출제 범위 상한(미포함), Infinity = 제한 없음
let confirmed = { name: false, gender: false, crew: false, startYear: false, age: false, fanCount: false }; // 정답 사진 옆 5칸 확정 여부
let volume = 25; // 사운드/배경음악 기본 볼륨 (bindEvents() -> initSound() 에서 곧바로 참조하므로 맨 위에서 선언해야 한다)
let audioCtx = null;
let dexSortKey = "name"; // "name" | "startYear" | "age" | "fanCount" — 도감 정렬 기준
let dexSortDir = "asc"; // "asc" | "desc"

const $ = (sel) => document.querySelector(sel);

// 화면
const appEl = $(".app");
const homeScreenEl = $("#homeScreen");
const statsScreenEl = $("#statsScreen");
const gameScreenEl = $("#gameScreen");

// 메인 화면
const homeMenuEl = $("#homeMenu");
const startGameBtn = $("#startGameBtn");
const dailyChallengeBtn = $("#dailyChallengeBtn");
const tutorialBtn = $("#tutorialBtn");
const statsBtn = $("#statsBtn");
const settingsBtn = $("#settingsBtn");
const settingsPopoverEl = $("#settingsPopover");
const homeVolumeSliderEl = $("#homeVolumeSlider");
const homeVolumeIconEl = $("#homeVolumeIcon");
const settingsResetStatsBtn = $("#settingsResetStatsBtn");

// 출제 범위 선택 메뉴 — 기본은 버튼 목록(전체/2천 미만/.../직접 범위 설정), "⚙️ 직접 범위 설정"을
// 누르면 그 안에서 구간 슬라이더 화면으로 전환된다.
const modeMenuEl = $("#modeMenu");
const modePresetsEl = $("#modePresets");
const modeCustomEl = $("#modeCustom");
const modeBackBtn = $("#modeBackBtn");
const customRangeBtn = $("#customRangeBtn");
const customBackBtn = $("#customBackBtn");
const rangeModeBtns = Array.from(document.querySelectorAll(".range-mode-btn[data-min]")); // 직접 범위 설정 버튼은 data-min이 없어 제외됨
const rangeMinSliderEl = $("#rangeMinSlider");
const rangeMaxSliderEl = $("#rangeMaxSlider");
const rangeFillEl = $("#rangeFill");
const rangeMinInputEl = $("#rangeMinInput");
const rangeMaxInputEl = $("#rangeMaxInput");
const rangeStartBtn = $("#rangeStartBtn");

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
const confirmedNameEl = $("#confirmedName");
const confirmedGenderEl = $("#confirmedGender");
const confirmedCrewEl = $("#confirmedCrew");
const confirmedStartYearEl = $("#confirmedStartYear");
const confirmedAgeEl = $("#confirmedAge");
const confirmedFanEl = $("#confirmedFan");
const guessBoxEl = $("#guessBox");
const inputEl = $("#guessInput");
const submitBtn = $("#submitBtn");
const suggestionsEl = $("#suggestions");
const boardBodyEl = $("#boardBody");
const guessCountEl = $("#guessCount");
const hintBtn = $("#hintBtn");
const giveupBtn = $("#giveupBtn");
const resultPanelEl = $("#resultPanel");
const resultTextEl = $("#resultText");
const playAgainBtn = $("#playAgainBtn");
const stationLinkBtn = $("#stationLinkBtn");
const revealPhotoEl = $("#revealPhoto");
const revealNameEl = $("#revealName");
const firstGuessHintEl = $("#firstGuessHint");
const firstGuessHintCloseBtn = $("#firstGuessHintCloseBtn");
const dexGameBtn = $("#dexGameBtn");

// 버튜버 도감 (검색/필터로 전체 버튜버를 훑어보는 오버레이 모달 — 어느 화면에서 열어도
// 그 화면의 진행 상태를 건드리지 않는다)
const dexHomeBtn = $("#dexHomeBtn");
const dexModalEl = $("#dexModal");
const dexPanelEl = $(".dex-panel");
const dexDragHandleEl = $("#dexDragHandle");
const dexCloseBtn = $("#dexCloseBtn");
const dexSearchInputEl = $("#dexSearchInput");
const dexGenderFilterEl = $("#dexGenderFilter");
const dexChosungFilterEl = $("#dexChosungFilter");
const dexCrewFilterEl = $("#dexCrewFilter");
const dexStartYearFilterEl = $("#dexStartYearFilter");
const dexAgeFilterEl = $("#dexAgeFilter");
const dexFanMinInputEl = $("#dexFanMinInput");
const dexFanMaxInputEl = $("#dexFanMaxInput");
const dexFilterResetBtn = $("#dexFilterResetBtn");
const dexListBodyEl = $("#dexListBody");
const dexEmptyEl = $("#dexEmpty");
const dexSortHeaderEls = Array.from(document.querySelectorAll(".dex-sort"));
const dexPhotoPopupEl = $("#dexPhotoPopup");
const dexPhotoCloseBtn = $("#dexPhotoCloseBtn");
const dexPhotoImageEl = $("#dexPhotoImage");
const dexPhotoNameEl = $("#dexPhotoName");
const imagePreloadStatusEl = $("#imagePreloadStatus");
const imagePreloadTextEl = $("#imagePreloadText");

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
    preloadAllImages();
  } catch (e) {
    dataLoadFailed = true;
    console.error(e);
  }
}

// 크루 로고 + 스트리머 개인 사진을 전부 백그라운드에서 미리 불러온다. 크루 로고는 게임 중 계속
// 반복 등장(badge/확정칸)하고, 스트리머 사진은 정답 공개/도감 팝업에서 쓰이는데 수가 많아서(400장+)
// 처음 볼 때 로딩이 느껴질 수 있어 같이 미리 캐싱해둔다. 사이트 진입/게임 플레이는 전혀 막지 않고,
// 다 불러올 때까지만 작은 상태 표시를 살짝 보여준다.
function preloadAllImages() {
  const crewPaths = Object.values(crewImageByName);
  const streamerPaths = streamers.map((s) => s.photo);
  const uniquePaths = Array.from(
    new Set([...crewPaths, ...streamerPaths].filter((path) => hasValidImagePath(path)))
  );
  if (uniquePaths.length === 0) return;

  let loadedCount = 0;
  const total = uniquePaths.length;

  imagePreloadStatusEl.classList.remove("hidden");
  updateImagePreloadText(loadedCount, total);

  uniquePaths.forEach((path) => {
    const img = new Image();
    img.onload = img.onerror = () => {
      loadedCount++;
      updateImagePreloadText(loadedCount, total);
      if (loadedCount === total) {
        setTimeout(() => imagePreloadStatusEl.classList.add("hidden"), 600);
      }
    };
    img.src = path;
  });
}

function updateImagePreloadText(loadedCount, total) {
  imagePreloadTextEl.textContent = `🖼️ 이미지 불러오는 중... (${loadedCount}/${total})`;
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
  // 게임 화면은 힌트 보드가 6종류 힌트+이름 칸까지 있어 넓은 화면(PC)에서는 가로 스크롤 없이
  // 다 보이도록 .app 자체를 더 넓게 쓴다(.app-wide, 데스크탑 폭에서만 CSS로 적용) — 홈/통계
  // 화면은 원래 폭 그대로 유지한다.
  appEl.classList.toggle("app-wide", name === "game");
}

function goHome() {
  isTutorial = false;
  hideTutorialUI();
  resetGameState(); // 메인화면으로 나가면 진행 중이던 문제는 초기화한다
  showHomeMenu(); // 출제 범위 선택 화면이 열려 있었다면 메인 메뉴로 되돌린다
  showScreen("home");
}

// 메인 화면의 "메인 메뉴" <-> "출제 범위 선택" 전환
function showHomeMenu() {
  modeMenuEl.classList.add("hidden");
  homeMenuEl.classList.remove("hidden");
}

// 출제 범위 화면은 항상 버튼 목록(모드 프리셋)부터 보여준다 — "직접 범위 설정"으로 들어갔다가
// 다시 이 화면으로 돌아와도 슬라이더 화면이 아니라 목록이 먼저 보이는 게 자연스럽다.
function showModePresets() {
  modeCustomEl.classList.add("hidden");
  modePresetsEl.classList.remove("hidden");
}

function showModeCustom() {
  modePresetsEl.classList.add("hidden");
  modeCustomEl.classList.remove("hidden");
  setRangeFromIndexes();
}

function showModeMenu() {
  homeMenuEl.classList.add("hidden");
  modeMenuEl.classList.remove("hidden");
  showModePresets();
}

// ---------------------------------------------------------
// 버튜버 도감 — 홈 화면 "📖 버튜버 도감" 버튼과 게임 화면 툴바의 "📖 도감" 버튼 둘 다에서 연다.
// 화면 전환(showScreen)이 아니라 현재 화면 위에 뜨는 오버레이 모달이라서, 게임 중에 열어도
// 진행 중인 라운드(target/guessedNames/board 등)를 전혀 건드리지 않고 닫으면 그대로 이어서 할 수 있다.
// ---------------------------------------------------------
let dexFilterOptionsBuilt = false;

async function openDex() {
  resetDexPanelPosition(); // 열 때마다 기본 위치(옆 빈 공간/화면 중앙)로 되돌린 뒤 시작한다
  dexModalEl.classList.remove("hidden");
  await dataLoadPromise; // 홈 화면에서 게임을 한 번도 시작하지 않은 채 열었을 수도 있으므로 데이터 로드를 기다린다
  if (!dexFilterOptionsBuilt) {
    populateDexCrewFilter();
    populateDexNumericFilter(dexStartYearFilterEl, "startYear", (v) => `${v}년`);
    populateDexNumericFilter(dexAgeFilterEl, "age", (v) => `${v}세`);
    dexFilterOptionsBuilt = true;
  }
  renderDexList();
  dexSearchInputEl.focus();
}

// ---------------------------------------------------------
// 도감 패널 드래그 이동 — 상단바(dexDragHandle)를 잡고 끌면 원하는 위치로 옮길 수 있다.
// 기본값(옆 빈 공간에 뜨는 위치 또는 모바일 화면 중앙)은 openDex()가 열 때마다 되돌려준다.
// ---------------------------------------------------------
let dexDrag = null; // { offsetX, offsetY } — 드래그 중일 때만 값이 있음

function resetDexPanelPosition() {
  dexPanelEl.style.position = "";
  dexPanelEl.style.left = "";
  dexPanelEl.style.top = "";
  dexPanelEl.style.margin = "";
}

function startDexDrag(e) {
  if (e.target.closest("#dexCloseBtn")) return; // 닫기 버튼을 눌렀을 때는 드래그를 시작하지 않는다
  const rect = dexPanelEl.getBoundingClientRect();
  dexDrag = {
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };
  // 지금까지의 위치(가운데 정렬/옆 배치 등 CSS로 계산된 값)를 고정 좌표로 그대로 옮겨서,
  // 드래그가 시작되는 순간 패널이 갑자기 튀지 않게 한다.
  dexPanelEl.style.position = "fixed";
  dexPanelEl.style.left = rect.left + "px";
  dexPanelEl.style.top = rect.top + "px";
  dexPanelEl.style.margin = "0";
  dexPanelEl.classList.add("dex-dragging");
  document.addEventListener("pointermove", onDexDrag);
  document.addEventListener("pointerup", stopDexDrag);
}

function onDexDrag(e) {
  if (!dexDrag) return;
  const rect = dexPanelEl.getBoundingClientRect();
  // 화면 밖으로 완전히 나가서 못 찾게 되지 않도록, 최소한 조금은 화면 안에 걸쳐 있게 한다.
  const minLeft = -rect.width + 80;
  const maxLeft = window.innerWidth - 80;
  const minTop = 0;
  const maxTop = window.innerHeight - 60;
  const newLeft = Math.min(Math.max(e.clientX - dexDrag.offsetX, minLeft), maxLeft);
  const newTop = Math.min(Math.max(e.clientY - dexDrag.offsetY, minTop), maxTop);
  dexPanelEl.style.left = newLeft + "px";
  dexPanelEl.style.top = newTop + "px";
}

function stopDexDrag() {
  dexDrag = null;
  dexPanelEl.classList.remove("dex-dragging");
  document.removeEventListener("pointermove", onDexDrag);
  document.removeEventListener("pointerup", stopDexDrag);
}

function closeDex() {
  dexModalEl.classList.add("hidden");
  closeDexPhoto(); // 도감을 닫을 때 사진 팝업이 떠 있었다면 같이 닫아둔다
}

// 실제 존재하는(멤버가 1명 이상인) 크루만 필터 목록에 올린다 — 크루 탭의 빈 플레이스홀더 행은 제외.
function populateDexCrewFilter() {
  const crewNames = new Set();
  streamers.forEach((s) => getCrewNames(s).forEach((c) => crewNames.add(c)));
  const sorted = Array.from(crewNames).sort((a, b) => a.localeCompare(b, "ko"));
  sorted.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    dexCrewFilterEl.appendChild(opt);
  });
}

// 방송 시작/나이 필터: 범위 입력이 아니라 실제로 존재하는 값들만 목록으로 골라 담는다
// (성별/초성/크루 필터와 같은 방식) — 오름차순으로 정렬해서 넣는다.
function populateDexNumericFilter(selectEl, field, formatter) {
  const values = new Set();
  streamers.forEach((s) => {
    if (s[field] != null) values.add(s[field]);
  });
  const sorted = Array.from(values).sort((a, b) => a - b);
  sorted.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = formatter(value);
    selectEl.appendChild(opt);
  });
}

// (min, max) 입력칸 두 개를 읽어서 {min, max} 형태로 반환한다 (빈칸이면 null = 그쪽 제한 없음).
function readRangeInputs(minEl, maxEl) {
  const minRaw = minEl.value.trim();
  const maxRaw = maxEl.value.trim();
  return {
    min: minRaw === "" ? null : Number(minRaw),
    max: maxRaw === "" ? null : Number(maxRaw),
  };
}

// value가 [min, max] 범위 안에 있는지 확인한다. min/max가 둘 다 null이면(범위 필터 자체를 안 쓰는
// 경우) 항상 true. 범위가 걸려 있는데 value가 비공개(null)라면 확인할 수 없으니 false로 제외한다.
function isInRange(value, min, max) {
  if (min == null && max == null) return true;
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function renderDexList() {
  const query = dexSearchInputEl.value.trim().toLowerCase();
  const genderFilter = dexGenderFilterEl.value;
  const chosungFilter = dexChosungFilterEl.value;
  const crewFilter = dexCrewFilterEl.value;
  const startYearFilter = dexStartYearFilterEl.value;
  const ageFilter = dexAgeFilterEl.value;
  const fanRange = readRangeInputs(dexFanMinInputEl, dexFanMaxInputEl);

  const filtered = streamers.filter((s) => {
    if (query && !s.name.toLowerCase().includes(query)) return false;
    if (genderFilter && s.gender !== genderFilter) return false;
    if (chosungFilter && getChosung(s.name) !== chosungFilter) return false;
    if (crewFilter && !getCrewNames(s).includes(crewFilter)) return false;
    if (startYearFilter && s.startYear !== Number(startYearFilter)) return false;
    if (ageFilter === "__private__" && s.age != null) return false;
    else if (ageFilter && ageFilter !== "__private__" && s.age !== Number(ageFilter)) return false;
    if (!isInRange(s.fanCount, fanRange.min, fanRange.max)) return false;
    return true;
  });

  filtered.sort((a, b) => compareDexRows(a, b));

  dexListBodyEl.innerHTML = "";
  filtered.forEach((s) => dexListBodyEl.appendChild(renderDexRow(s)));
  dexEmptyEl.classList.toggle("hidden", filtered.length > 0);
  updateDexSortIndicators();
}

// 이름은 항상 가나다순 비교, 방송 시작/나이/애청자 수는 숫자 비교. 비공개(null)는 정렬 방향(오름차순/
// 내림차순)과 무관하게 항상 맨 뒤로 보낸다 — 오름차순인데 비공개가 맨 위로 튀어나오면 헷갈리기 때문.
function compareDexRows(a, b) {
  if (dexSortKey === "name") {
    const cmp = a.name.localeCompare(b.name, "ko");
    return dexSortDir === "asc" ? cmp : -cmp;
  }
  const av = a[dexSortKey];
  const bv = b[dexSortKey];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const cmp = av - bv;
  return dexSortDir === "asc" ? cmp : -cmp;
}

// 정렬 헤더(이름/방송 시작/나이/애청자 수) 클릭: 같은 항목을 다시 누르면 방향 반전,
// 다른 항목을 누르면 그 항목의 오름차순으로 새로 시작한다.
function setDexSort(key) {
  if (dexSortKey === key) {
    dexSortDir = dexSortDir === "asc" ? "desc" : "asc";
  } else {
    dexSortKey = key;
    dexSortDir = "asc";
  }
  renderDexList();
}

function updateDexSortIndicators() {
  dexSortHeaderEls.forEach((el) => {
    const isActive = el.dataset.sort === dexSortKey;
    el.classList.toggle("active", isActive);
    el.querySelector(".sort-arrow").textContent = isActive ? (dexSortDir === "asc" ? "▲" : "▼") : "";
  });
}

function renderDexRow(streamer) {
  const row = document.createElement("div");
  row.className = "board-row dex-row dex-row-clickable";
  row.title = "클릭하면 사진을 볼 수 있어요";
  row.addEventListener("click", () => openDexPhoto(streamer));

  row.appendChild(nameCell(streamer.name));
  row.appendChild(dexTextCell(genderSymbol(streamer.gender) || "비공개"));

  const crewNames = getCrewNames(streamer);
  row.appendChild(dexTextCell(crewNames.length ? crewNames[0] : "무소속"));

  row.appendChild(dexTextCell(streamer.startYear != null ? `${streamer.startYear}년` : "?"));
  row.appendChild(dexTextCell(
    streamer.age != null ? `${streamer.age}세` : "비공개",
    ageHoverTooltip(streamer)
  ));
  row.appendChild(dexTextCell(formatFanCount(streamer.fanCount)));

  return row;
}

// 도감에서 스트리머 행을 클릭하면 사진 팝업을 띄운다 (정답 공개 사진과 같은 방식으로 렌더링).
function openDexPhoto(streamer) {
  dexPhotoNameEl.textContent = streamer.name;
  renderStreamerPhoto(dexPhotoImageEl, streamer);
  dexPhotoPopupEl.classList.remove("hidden");
}

function closeDexPhoto() {
  dexPhotoPopupEl.classList.add("hidden");
}

function dexTextCell(text, tooltip) {
  const div = document.createElement("div");
  div.className = "cell";
  div.textContent = text;
  if (tooltip) {
    div.setAttribute("data-tooltip", tooltip);
  }
  return div;
}

function resetDexFilters() {
  dexSearchInputEl.value = "";
  dexGenderFilterEl.value = "";
  dexChosungFilterEl.value = "";
  dexCrewFilterEl.value = "";
  dexStartYearFilterEl.value = "";
  dexAgeFilterEl.value = "";
  dexFanMinInputEl.value = "";
  dexFanMaxInputEl.value = "";
  renderDexList();
}

// ---------------------------------------------------------
// 출제 범위 슬라이더 (양쪽 끝 손잡이로 구간을 정하거나, 위쪽 버튼으로 간편하게 정하거나,
// 입력칸에 직접 숫자를 입력해서 정할 수 있다)
//
// rangeMinIndex/rangeMaxIndex : 슬라이더 손잡이 위치 (RANGE_STEPS 인덱스, 드래그용)
// rangeMinValue/rangeMaxValue : 실제로 필터에 쓰이는 값 (입력칸에 임의의 숫자를 직접 넣을 수 있어서
//                                손잡이가 딱 맞는 눈금에 있지 않아도 될 수 있다)
// ---------------------------------------------------------
let rangeMinIndex = 0;
let rangeMaxIndex = RANGE_LAST_INDEX;
let rangeMinValue = 0;
let rangeMaxValue = Infinity;

// 임의의 숫자(직접 입력값)와 가장 가까운 슬라이더 눈금의 인덱스를 찾는다 (손잡이 위치 갱신용)
function findNearestStepIndex(value) {
  if (value === Infinity) return RANGE_LAST_INDEX;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < RANGE_STEPS.length; i++) {
    const stepVal = RANGE_STEPS[i].value;
    if (stepVal === Infinity) continue;
    const diff = Math.abs(stepVal - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// 슬라이더 손잡이/채움/프리셋 강조만 갱신 (입력칸 텍스트는 건드리지 않음 — 타이핑 중에 덮어쓰지 않기 위해)
function updateSliderVisual() {
  if (rangeMinIndex > rangeMaxIndex) rangeMinIndex = rangeMaxIndex;

  rangeMinSliderEl.value = String(rangeMinIndex);
  rangeMaxSliderEl.value = String(rangeMaxIndex);

  const pct = (i) => (i / RANGE_LAST_INDEX) * 100;
  rangeFillEl.style.left = pct(rangeMinIndex) + "%";
  rangeFillEl.style.width = Math.max(0, pct(rangeMaxIndex) - pct(rangeMinIndex)) + "%";
}

// 입력칸 두 개의 표시 텍스트를 현재 값으로 맞춘다
function updateRangeInputsFromValues() {
  rangeMinInputEl.value = String(rangeMinValue);
  rangeMaxInputEl.value = rangeMaxValue === Infinity ? "" : String(rangeMaxValue);
}

// 슬라이더(손잡이 드래그)나 프리셋 버튼으로 값이 바뀌었을 때: 인덱스 -> 실제 값 -> 화면 전부 갱신
// ("가로선 손잡이를 드래그하면 입력칸 안의 숫자가 변하게" 요구사항)
function setRangeFromIndexes() {
  rangeMinValue = RANGE_STEPS[rangeMinIndex].value;
  rangeMaxValue = RANGE_STEPS[rangeMaxIndex].value;
  updateSliderVisual();
  updateRangeInputsFromValues();
}

// 입력칸에 직접 숫자를 타이핑했을 때: 값은 그대로 두고, 손잡이 위치만 가장 가까운 눈금으로 옮긴다
// (입력 중인 글자를 되돌려쓰지 않기 위해 입력칸 자체는 다시 렌더링하지 않음)
function setRangeFromInputs() {
  rangeMinIndex = findNearestStepIndex(rangeMinValue);
  rangeMaxIndex = findNearestStepIndex(rangeMaxValue);
  updateSliderVisual();
}

// 입력칸에서 포커스가 빠져나갈 때: min > max 처럼 어긋난 값을 정리한다
function finalizeRangeInputs() {
  if (rangeMinValue > rangeMaxValue) rangeMinValue = rangeMaxValue;
  updateRangeInputsFromValues();
  setRangeFromInputs();
}

// 진행 중인 라운드를 완전히 비운다 (다음에 "게임 시작"을 누르면 새 문제로 시작)
function resetGameState() {
  target = null;
  isDailyChallenge = false;
  guessedNames = [];
  hintUseCount = 0;
  confirmed = { name: false, gender: false, crew: false, startYear: false, age: false, fanCount: false };
  boardBodyEl.innerHTML = "";
  updateGuessCount();
  resetReveal();
  showRoundInProgress();
  renderConfirmedHints();
  updateHintBtnState();
  hideFirstGuessHint();
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
  // 매번 새 문제로 시작한다 (이전 진행 상황을 이어서 하지 않음)
  runInGameScreen(() => startNewGame());
}

// ---------------------------------------------------------
// 일일 도전 — 모든 유저에게 오늘 하루 동안 같은 스트리머가 정답으로 나오고, 10번 안에 맞혀야 한다.
// 오늘 이미 플레이했으면 다시 도전할 수 없고(내일 다시 오라는 안내만 뜸), 결과는 일반 통계와
// 섞이지 않도록 별도 localStorage 키에 저장한다.
// ---------------------------------------------------------
function getTodayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 문자열을 간단한 정수로 해시한다 — 같은 문자열(=같은 날짜)이면 항상 같은 값이 나온다.
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// 오늘의 도전 정답: 이름순으로 정렬해 항상 같은 순서를 만든 뒤, 오늘 날짜 문자열의 해시값으로
// 그중 한 명을 고른다 — 같은 날이면 누가 접속하든 항상 같은 스트리머가 나오고, 날짜가 바뀌면
// 자동으로 다른 사람으로 바뀐다.
function pickDailyTarget() {
  if (streamers.length === 0) return null;
  const pool = streamers.slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const hash = hashStringToInt(getTodayDateString());
  return pool[hash % pool.length];
}

function loadDailyResult() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveDailyResult(result) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(result));
  } catch (e) {
    /* 무시 */
  }
}

// 시도(추측+힌트보기 합산)가 10회에 도달했는데 아직 못 맞혔으면 그 자리에서 실패 처리한다.
// (정답을 맞혀서 이기는 경로는 submitGuess에서 따로 처리하므로 여기서는 실패만 검사한다.)
function checkDailyAttemptLimit() {
  if (!isDailyChallenge) return;
  if (getAttemptCount() >= DAILY_ATTEMPT_LIMIT) {
    showWin(true);
  }
}

function startDailyChallenge() {
  const today = getTodayDateString();
  const saved = loadDailyResult();
  if (saved && saved.date === today) {
    alert(
      saved.won
        ? `오늘의 도전을 이미 성공하셨어요! "${saved.targetName}" (${saved.attempts}번 시도)\n내일 다시 도전해보세요.`
        : `오늘의 도전에 이미 실패하셨어요. 정답은 "${saved.targetName}" 였어요. (${saved.attempts}번 시도)\n내일 다시 도전해보세요.`
    );
    return;
  }
  isTutorial = false;
  hideTutorialUI();
  runInGameScreen(() => {
    startNewGame(pickDailyTarget());
    isDailyChallenge = true;
    tutorialTitleEl.textContent = "일일 도전";
    tutorialTitleEl.classList.remove("hidden");
    updateGuessCount();
  });
}

// ---------------------------------------------------------
// 게임 상태
// ---------------------------------------------------------

// 현재 선택된 출제 범위(currentRangeMin~currentRangeMax)에 맞는 스트리머만 걸러낸다.
// 하한은 포함, 상한은 미포함 — 예: [2000, Infinity) 면 "2천 이상 전부", [0, 2000) 면 "2천 미만 전부"
// (2천~5천처럼 좁은 구간으로 잘못 해석되지 않도록 항상 이 규칙을 지킨다).
// 애청자 수가 비공개(null)인 스트리머는 범위를 확인할 수 없으므로, 전체 범위가 아닐 때는 제외한다.
// (방송 시작 연도는 비공개여도 출제 대상에서 제외하지 않는다 — 힌트에서 "?"로 표시될 뿐 정답으로는 나올 수 있다.)
function getModeFilteredPool() {
  if (currentRangeMin === 0 && currentRangeMax === Infinity) return streamers;
  return streamers.filter((s) => {
    if (s.fanCount == null) return false;
    if (s.fanCount < currentRangeMin) return false;
    if (currentRangeMax !== Infinity && s.fanCount >= currentRangeMax) return false;
    return true;
  });
}

function pickRandomTarget(excludeName) {
  let pool = getModeFilteredPool();
  if (pool.length === 0) pool = streamers; // 해당 범위에 아무도 없으면 안전하게 전체에서 뽑는다
  if (excludeName) {
    const filtered = pool.filter((s) => s.name !== excludeName);
    if (filtered.length > 0) pool = filtered;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function startNewGame(newTarget) {
  target = newTarget || pickRandomTarget();
  isDailyChallenge = false; // 기본은 일반 라운드 — 일일 도전은 호출부(startDailyChallenge)에서 바로 뒤에 true로 바꿔준다
  guessedNames = [];
  hintUseCount = 0;
  confirmed = { name: false, gender: false, crew: false, startYear: false, age: false, fanCount: false };
  boardBodyEl.innerHTML = "";
  updateGuessCount();
  resetReveal();
  showRoundInProgress();
  renderConfirmedHints();
  updateHintBtnState();
  resetDexFilters(); // 다른 문제로 넘어가면 도감에 남아있던 필터도 초기화한다
  showFirstGuessHint();
  inputEl.value = "";
  inputEl.focus();
}

// ---------------------------------------------------------
// 정답 사진과 입력창 사이의 6칸 — 이름 초성/성별/크루/방송 시작 연도/나이/애청자수 중 확정된 것만 채운다
// ---------------------------------------------------------
function updateConfirmedFromCmp(cmp) {
  if (cmp.nameCmp.match) confirmed.name = true;
  if (cmp.genderCmp.match) confirmed.gender = true;
  if (cmp.crewCmp.match) confirmed.crew = true;
  if (cmp.startYearCmp.match) confirmed.startYear = true;
  if (cmp.ageCmp.match) confirmed.age = true;
  if (cmp.fanCmp.match) confirmed.fanCount = true;
}

// "💡 힌트보기" 버튼: 소속 크루/방송 시작/나이/애청자 수 중 아직 확정되지 않은 항목 하나를 무작위로
// 확정칸에 채워준다(이름/성별은 대상에서 제외 — 이름은 힌트 없이도 초성으로 항상 유추 가능하고,
// 성별은 선택지가 둘뿐이라 힌트로서 의미가 약해서). 횟수 제한은 없이 몇 번이든 쓸 수 있지만, 쓸 때마다
// 시도 횟수를 1회씩 소모한다(실제로 스트리머를 추측한 건 아니라서 guessedNames에는 추가하지 않고,
// getAttemptCount()가 hintUseCount를 더해서 카운트한다). 채울 후보가 다 떨어지면(넷 다 확정) 자연히
// 더 쓸 수 없다.
const HINT_REVEAL_CATEGORIES = ["crew", "startYear", "age", "fanCount"];

function useHintReveal() {
  if (!target) return;
  const candidates = HINT_REVEAL_CATEGORIES.filter((key) => !confirmed[key]);
  if (candidates.length === 0) return; // 이미 넷 다 확정된 경우 — 버튼이 비활성화돼 있어야 정상
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  confirmed[picked] = true;
  hintUseCount++;
  renderConfirmedHints();
  updateGuessCount();
  updateHintBtnState();
  checkDailyAttemptLimit();
}

// "💡 힌트보기" 버튼의 활성/비활성 상태를 갱신한다 — 채워줄 항목(크루/방송시작/나이/애청자 수)이 더 없으면 비활성화.
function updateHintBtnState() {
  const noCandidatesLeft = HINT_REVEAL_CATEGORIES.every((key) => confirmed[key]);
  hintBtn.disabled = noCandidatesLeft;
}

// 실제로 추측(guessedNames)한 횟수 + 힌트보기 사용 횟수를 합친, 화면에 보여줄 시도 횟수.
function getAttemptCount() {
  return guessedNames.length + hintUseCount;
}

function renderConfirmedHints() {
  renderConfirmedSlot(confirmedNameEl, confirmed.name, () => ({
    text: getChosung(target.name),
  }));

  renderConfirmedSlot(confirmedGenderEl, confirmed.gender, () => ({
    text: genderSymbol(target.gender) || "비공개",
  }));

  renderConfirmedSlot(confirmedCrewEl, confirmed.crew, () => {
    const names = getCrewNames(target);
    if (names.length === 0) return { text: "무소속" };
    return { crew: true, name: names[0], image: target.crewImage };
  });

  renderConfirmedSlot(confirmedStartYearEl, confirmed.startYear, () => ({
    text: target.startYear != null ? `${target.startYear}년` : "?",
  }));

  renderConfirmedSlot(confirmedAgeEl, confirmed.age, () => ({
    text: target.age != null ? `${target.age}세` : "비공개",
    tooltip: ageHoverTooltip(target),
  }));

  renderConfirmedSlot(confirmedFanEl, confirmed.fanCount, () => ({
    text: formatFanCount(target.fanCount),
  }));
}

function renderConfirmedSlot(el, isConfirmed, contentFn) {
  el.classList.toggle("confirmed", isConfirmed);
  el.removeAttribute("data-tooltip");

  if (!isConfirmed) {
    el.innerHTML = '<span class="confirmed-mark">?</span>';
    return;
  }

  const data = contentFn();

  if (data.crew) {
    el.setAttribute("data-tooltip", data.name);
    if (hasValidImagePath(data.image)) {
      el.innerHTML = "";
      const img = document.createElement("img");
      img.src = data.image;
      img.alt = data.name;
      img.onerror = () => {
        el.innerHTML = `<span class="confirmed-text">${escapeHtml(data.name.slice(0, 2))}</span>`;
      };
      el.appendChild(img);
    } else {
      el.innerHTML = `<span class="confirmed-text">${escapeHtml(data.name.slice(0, 2))}</span>`;
    }
    return;
  }

  if (data.tooltip) {
    el.setAttribute("data-tooltip", data.tooltip);
  }
  el.innerHTML = `<span class="confirmed-text">${escapeHtml(data.text)}</span>`;
}

// 라운드 진행 중 UI 상태 (입력창 보이기, 결과 패널 숨기기)
function showRoundInProgress() {
  resultPanelEl.classList.add("hidden");
  guessBoxEl.classList.remove("hidden");
  giveupBtn.classList.remove("hidden");
  hintBtn.classList.remove("hidden");
  inputEl.disabled = false;
  submitBtn.disabled = false;
  // 지난 라운드가 튜토리얼 완료 상태였다면 버튼을 기본 상태로 되돌린다
  playAgainBtn.textContent = "🔀 다른 문제 도전하기";
  playAgainBtn.dataset.mode = "";
}

// 라운드를 새로 시작할 때 정답 사진 박스 위에 뜨는 첫 안내 팝업 — X 버튼을 누르거나 첫 스트리머를
// 입력해서 힌트를 얻으면 사라진다. 튜토리얼은 자기만의 안내 배너가 이미 같은 역할을 하므로 제외.
function showFirstGuessHint() {
  if (isTutorial) return;
  firstGuessHintEl.classList.remove("hidden");
}

function hideFirstGuessHint() {
  firstGuessHintEl.classList.add("hidden");
}

// ---------------------------------------------------------
// 이벤트 바인딩
// ---------------------------------------------------------
function bindEvents() {
  // 메인 화면
  startGameBtn.addEventListener("click", showModeMenu);
  dailyChallengeBtn.addEventListener("click", startDailyChallenge);
  modeBackBtn.addEventListener("click", showHomeMenu);

  // 출제 범위 화면: 전체/2천 미만/2천 이상/5천 이상/1만 이상 버튼은 누르는 즉시 그 범위로 게임을 시작한다.
  rangeModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentRangeMin = RANGE_STEPS[Number(btn.dataset.min)].value;
      currentRangeMax = RANGE_STEPS[Number(btn.dataset.max)].value;
      enterRealGame();
    });
  });
  // "⚙️ 직접 범위 설정"만 예외적으로 슬라이더+입력칸 화면으로 넘어간다 (여기서 시작 버튼을 눌러야 시작됨)
  customRangeBtn.addEventListener("click", showModeCustom);
  customBackBtn.addEventListener("click", showModePresets);

  // 출제 범위 슬라이더 (직접 범위 설정 화면)
  rangeMinSliderEl.addEventListener("input", () => {
    rangeMinIndex = Math.min(Number(rangeMinSliderEl.value), rangeMaxIndex);
    setRangeFromIndexes();
  });
  rangeMaxSliderEl.addEventListener("input", () => {
    rangeMaxIndex = Math.max(Number(rangeMaxSliderEl.value), rangeMinIndex);
    setRangeFromIndexes();
  });

  // 입력칸에 직접 숫자 입력 (타이핑하는 동안은 값만 갱신하고 손잡이만 따라가며,
  // 입력칸 자체는 다시 쓰지 않아서 타이핑을 방해하지 않는다)
  rangeMinInputEl.addEventListener("input", () => {
    const raw = rangeMinInputEl.value.trim();
    const v = raw === "" ? 0 : Number(raw);
    if (isNaN(v) || v < 0) return;
    rangeMinValue = v;
    setRangeFromInputs();
  });
  rangeMaxInputEl.addEventListener("input", () => {
    const raw = rangeMaxInputEl.value.trim();
    const v = raw === "" ? Infinity : Number(raw);
    if (raw !== "" && (isNaN(v) || v < 0)) return;
    rangeMaxValue = v;
    setRangeFromInputs();
  });
  rangeMinInputEl.addEventListener("blur", finalizeRangeInputs);
  rangeMaxInputEl.addEventListener("blur", finalizeRangeInputs);

  rangeStartBtn.addEventListener("click", () => {
    currentRangeMin = rangeMinValue;
    currentRangeMax = rangeMaxValue;
    enterRealGame();
  });

  tutorialBtn.addEventListener("click", startTutorial);
  statsBtn.addEventListener("click", () => {
    renderStats();
    showScreen("stats");
  });

  // 버튜버 도감 (홈 화면 버튼 / 게임 화면 툴바 버튼 둘 다 같은 모달을 연다)
  dexHomeBtn.addEventListener("click", openDex);
  dexGameBtn.addEventListener("click", openDex);
  dexCloseBtn.addEventListener("click", closeDex);
  dexDragHandleEl.addEventListener("pointerdown", startDexDrag);
  dexModalEl.addEventListener("click", (e) => {
    if (e.target === dexModalEl) closeDex(); // 패널 바깥(어두운 배경) 클릭 시 닫기
  });
  dexPhotoCloseBtn.addEventListener("click", closeDexPhoto);
  dexPhotoPopupEl.addEventListener("click", (e) => {
    if (e.target === dexPhotoPopupEl) closeDexPhoto(); // 팝업 바깥(어두운 배경) 클릭 시 닫기
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // 사진 팝업이 떠 있으면 그것부터 닫고, 도감 자체는 다음 Escape에 닫는다.
    if (!dexPhotoPopupEl.classList.contains("hidden")) closeDexPhoto();
    else if (!dexModalEl.classList.contains("hidden")) closeDex();
  });
  dexSearchInputEl.addEventListener("input", renderDexList);
  dexGenderFilterEl.addEventListener("change", renderDexList);
  dexChosungFilterEl.addEventListener("change", renderDexList);
  dexCrewFilterEl.addEventListener("change", renderDexList);
  dexStartYearFilterEl.addEventListener("change", renderDexList);
  dexAgeFilterEl.addEventListener("change", renderDexList);
  dexFanMinInputEl.addEventListener("input", renderDexList);
  dexFanMaxInputEl.addEventListener("input", renderDexList);
  dexFilterResetBtn.addEventListener("click", resetDexFilters);
  dexSortHeaderEls.forEach((el) => el.addEventListener("click", () => setDexSort(el.dataset.sort)));

  // 상단바
  homeBtn.addEventListener("click", goHome);
  statsHomeBtn.addEventListener("click", goHome);

  // 통계 초기화 (통계 화면 버튼 / 설정 팝업 버튼 둘 다 같은 동작)
  resetStatsBtn.addEventListener("click", handleResetStats);
  settingsResetStatsBtn.addEventListener("click", handleResetStats);

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
    } else if (e.key === "Tab") {
      // 자동완성 목록 맨 위에 있는 스트리머 이름을 입력창에 채워준다 (제출은 아직 안 함)
      const topLi = suggestionsEl.querySelector("li");
      if (topLi && !suggestionsEl.classList.contains("hidden")) {
        e.preventDefault();
        inputEl.value = topLi.querySelector("span").textContent;
        suggestionsEl.classList.add("hidden");
      }
    }
  });
  inputEl.addEventListener("input", renderSuggestions);
  inputEl.addEventListener("focus", renderSuggestions);
  document.addEventListener("click", (e) => {
    if (!suggestionsEl.contains(e.target) && e.target !== inputEl) {
      suggestionsEl.classList.add("hidden");
    }
  });

  firstGuessHintCloseBtn.addEventListener("click", hideFirstGuessHint);
  hintBtn.addEventListener("click", useHintReveal);
  giveupBtn.addEventListener("click", () => {
    if (!target) return;
    if (!guessedNames.includes(target.name)) {
      const cmp = renderGuessRow(target);
      updateConfirmedFromCmp(cmp);
      guessedNames.push(target.name);
      renderConfirmedHints();
      updateGuessCount();
      updateHintBtnState();
    }
    showWin(true);
  });
  playAgainBtn.addEventListener("click", () => {
    if (playAgainBtn.dataset.mode === "tutorial-end") {
      goHome();
    } else {
      startNewGame(pickRandomTarget(target ? target.name : null));
      tutorialTitleEl.classList.add("hidden"); // 일일 도전 중이었다면 "일일 도전" 제목을 다시 숨긴다
    }
  });

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
  hideFirstGuessHint(); // 첫 스트리머를 입력해 힌트를 얻었으니 안내 팝업은 이제 그만 보여준다
  const cmp = renderGuessRow(streamer);
  updateConfirmedFromCmp(cmp);
  renderConfirmedHints();
  updateGuessCount();
  updateHintBtnState();
  inputEl.value = "";
  suggestionsEl.classList.add("hidden");

  if (isTutorial && tutorialStepIndex === 0) {
    advanceTutorial();
  }

  if (streamer.name === target.name) {
    playSuccess();
    showWin();
  } else {
    playPop();
    checkDailyAttemptLimit(); // 일일 도전 중 오답으로 시도 10회를 다 썼으면 그 자리에서 실패 처리
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
  const count = getAttemptCount();
  guessCountEl.textContent = isDailyChallenge ? `시도: ${count}/${DAILY_ATTEMPT_LIMIT}회` : `시도: ${count}회`;
}

// ---------------------------------------------------------
// 힌트 비교 로직
// ---------------------------------------------------------

// 한글 초성 19개, 유니코드 완성형 음절의 초성 인덱스와 같은 순서(=가나다순 초성 순서).
const CHOSUNG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// 이름 첫 글자가 완성형 한글 음절이면 초성 인덱스(0~18)를, 아니면(영문/숫자 등) null을 반환한다.
function getChosungIndex(name) {
  if (!name) return null;
  const code = name.codePointAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return Math.floor((code - 0xac00) / (21 * 28));
}

function getChosung(name) {
  const idx = getChosungIndex(name);
  return idx == null ? (name ? name[0] : "") : CHOSUNG_LIST[idx];
}

// 이름 힌트: 추측한 스트리머 이름의 초성을 보여주고, 정답의 초성이 가나다순으로 더 앞인지/뒤인지를
// 화살표로 알려준다. 예: 정답 "우왁굳"(ㅇ)인데 "천양"(ㅊ)을 추측하면 ㅊ을 보여주고, ㅇ이 ㅊ보다
// 앞이므로 왼쪽 화살표(◀)로 "정답은 더 앞선 초성으로 시작한다"는 걸 알려준다.
// 초성이 같으면(ㅊ==ㅊ처럼) 일치로 보고 파란색으로 표시한다.
function compareName(guessName, targetName) {
  const guessIdx = getChosungIndex(guessName);
  const targetIdx = getChosungIndex(targetName);
  const char = getChosung(guessName);

  if (guessIdx == null || targetIdx == null) {
    // 한글 완성형 음절이 아닌 예외적인 이름(영문/숫자 시작 등)은 초성 비교가 안 되니
    // 전체 이름 문자열 비교로 대체한다.
    const cmp = guessName.localeCompare(targetName, "ko");
    if (cmp === 0) return { match: true, direction: null, char };
    return { match: false, direction: cmp < 0 ? "right" : "left", char };
  }

  if (guessIdx === targetIdx) return { match: true, direction: null, char };
  return { match: false, direction: guessIdx < targetIdx ? "right" : "left", char };
}

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

// 힌트는 항상 "시도한(추측한) 스트리머"의 정보를 기준으로 보여준다.
// - 둘 다 비공개(guessVal == null && ansVal == null)면 "이 사람도 정답처럼 비공개다" 라는
//   뜻이므로 일치로 보고 파란색으로 표시한다.
// - 추측한 사람만 비공개면(guessVal == null, ansVal은 있음) 비교 자체가 안 되니 그냥 "비공개".
// - 정답 쪽만 비공개(ansVal == null)면 비교는 할 수 없지만, 추측한 사람의 실제 값은
//   그대로 보여준다(그 사람에 대한 정보이므로) — 다만 화살표는 못 띄우고 일치로도 안 본다.
function compareNumber(guessVal, ansVal) {
  if (guessVal == null && ansVal == null) {
    return { match: true, unknown: true, bothUnknown: true, direction: null };
  }
  if (guessVal == null) {
    return { match: false, unknown: true, direction: null };
  }
  if (ansVal == null) {
    return { match: false, unknown: false, direction: null, targetUnknown: true };
  }
  if (guessVal === ansVal) return { match: true, unknown: false, direction: null };
  return { match: false, unknown: false, direction: guessVal < ansVal ? "up" : "down" };
}

// 나이 배지에 마우스를 올리면 뜨는 툴팁: 실제 나이인 스트리머(시트에 출생연도까지 채워져 있음)는
// 그 출생연도를 그대로 보여주고, 컨셉(RP) 나이인 스트리머(나이만 있고 출생연도는 비어있음)는
// "RP"라고 표시해 실제 나이가 아님을 알려준다. 나이 자체가 없으면 툴팁을 아예 달지 않는다.
function ageHoverTooltip(streamer) {
  if (streamer.age == null) return null;
  return streamer.birthYear != null ? `${streamer.birthYear}년` : "RP";
}

// 소수 첫째자리까지 내림해서 표시한다 (반올림하면 실제보다 부풀려 보일 수 있어서 항상 내림).
// 예: 18000 -> "1.8만", 7800 -> "7.8천". 딱 떨어지는 값(20000 등)은 ".0"을 안 붙이고 "2만"으로 표시.
function formatFanCount(n) {
  if (n == null) return "비공개";

  function oneDecimal(divided) {
    const rounded = Math.floor(divided * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  }

  if (n >= 10000) return oneDecimal(n / 10000) + "만";
  if (n >= 1000) return oneDecimal(n / 1000) + "천";
  return String(n) + "명";
}

// ---------------------------------------------------------
// 렌더링
// ---------------------------------------------------------
function computeHintComparisons(streamer) {
  return {
    nameCmp: compareName(streamer.name, target.name),
    genderCmp: compareGender(streamer.gender, target.gender),
    crewCmp: compareCrew(streamer, target),
    startYearCmp: compareNumber(streamer.startYear, target.startYear),
    ageCmp: compareNumber(streamer.age, target.age),
    fanCmp: compareNumber(streamer.fanCount, target.fanCount),
  };
}

function renderGuessRow(streamer) {
  const row = document.createElement("div");
  row.className = "board-row guess-row";

  const cmp = computeHintComparisons(streamer);

  row.appendChild(nameCell(streamer.name));
  row.appendChild(chosungBadge(cmp.nameCmp));
  row.appendChild(genderBadge(streamer.gender, cmp.genderCmp));
  row.appendChild(crewBadge(cmp.crewCmp.crewName, resolveCrewImage(streamer, cmp.crewCmp.crewName), cmp.crewCmp));
  row.appendChild(numberBadge(streamer.startYear, cmp.startYearCmp, (v) => `${v}년`, null, "?"));
  row.appendChild(numberBadge(streamer.age, cmp.ageCmp, (v) => `${v}세`, () => ageHoverTooltip(streamer)));
  row.appendChild(numberBadge(streamer.fanCount, cmp.fanCmp, formatFanCount));

  boardBodyEl.prepend(row);
  return cmp;
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

// 이름 힌트 배지: 추측한 이름의 초성을 보여주고, 일치하지 않으면 정답 초성이 가나다순으로
// 더 앞(◀)인지 뒤(▶)인지 화살표로 알려준다.
function chosungBadge(cmp) {
  const div = document.createElement("div");
  div.className = "cell";
  const badge = document.createElement("div");
  badge.className = "badge" + (cmp.match ? " match" : "");

  const charSpan = document.createElement("span");
  charSpan.textContent = cmp.char;
  badge.appendChild(charSpan);

  if (cmp.direction) {
    const arrow = document.createElement("span");
    arrow.className = "arrow " + cmp.direction;
    arrow.textContent = cmp.direction === "right" ? "▶" : "◀";
    badge.appendChild(arrow);
  }

  div.appendChild(badge);
  return div;
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

// tooltipFn(value)가 주어지면(현재는 나이 배지에만 사용) 크루 배지처럼 마우스를 올렸을 때
// 툴팁으로 보여준다 — 값이 실제로 표시될 때만(비공개가 아닐 때만) 붙인다.
// unknownText: 값을 모를 때 보여줄 문구 (기본 "비공개" — 나이/애청자수처럼 진짜 비공개인 경우용).
// 방송 시작처럼 "비공개"가 아니라 그냥 못 찾은 것뿐인 항목은 "?"를 넘겨서 문구를 바꿀 수 있다.
function numberBadge(value, cmp, formatter, tooltipFn, unknownText) {
  const div = document.createElement("div");
  div.className = "cell";
  const badge = document.createElement("div");
  // 둘 다 비공개(bothUnknown)면 문구는 그대로지만 일치로 보고 파란색을 켠다.
  badge.className = "badge" + (cmp.bothUnknown ? " match" : cmp.unknown ? " unknown" : cmp.match ? " match" : "");
  // "?"처럼 한 글자짜리 문구는 "비공개"(3글자)용 작은 글씨 대신 물음표 기호 크기로 키운다.
  if (cmp.unknown && unknownText && unknownText !== "비공개") {
    badge.classList.add("unknown-symbol");
  }

  if (cmp.unknown) {
    badge.textContent = unknownText || "비공개";
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
    if (tooltipFn && value != null) {
      badge.setAttribute("data-tooltip", tooltipFn(value));
    }
  }

  div.appendChild(badge);
  return div;
}

// ---------------------------------------------------------
// 정답 맞혔을 때 색종이 폭죽 효과 — 외부 라이브러리 없이 캔버스에 직접 그린다.
// 화면 전체를 덮는 캔버스를 하나 붙였다가, 애니메이션이 끝나면 스스로 제거한다.
// ---------------------------------------------------------
function launchConfetti() {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const colors = ["#0388ff", "#38bdf8", "#ffd166", "#ff5c5c", "#7dd3fc", "#ffffff"];
  const pieceCount = 140;
  const pieces = [];
  for (let i = 0; i < pieceCount; i++) {
    pieces.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.35 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -11 - 4,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 16,
      gravity: 0.22 + Math.random() * 0.15,
    });
  }

  let frame = 0;
  const totalFrames = 130;

  function tick() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });

    if (frame < totalFrames) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(tick);
}

function showWin(gaveUp) {
  guessBoxEl.classList.add("hidden");
  giveupBtn.classList.add("hidden");
  hintBtn.classList.add("hidden");
  suggestionsEl.classList.add("hidden");
  hideFirstGuessHint(); // 한 번도 안 눌러본 채 "정답 보기"로 끝났을 경우를 위한 안전장치

  const attempts = getAttemptCount();
  const won = !gaveUp;

  if (isDailyChallenge) {
    resultTextEl.textContent = won
      ? `🎉 오늘의 도전 성공! "${target.name}" (${attempts}번 시도)`
      : `아쉽지만 오늘의 도전은 실패했어요. 정답은 "${target.name}" 였습니다. (${attempts}번 시도)`;
  } else {
    resultTextEl.textContent = won
      ? `🎉 정답입니다! "${target.name}" (${attempts}번 시도)`
      : `아쉽지만 정답은 "${target.name}" 였습니다. (${attempts}번 시도)`;
  }

  if (target.stationUrl) {
    stationLinkBtn.href = target.stationUrl;
    stationLinkBtn.classList.remove("hidden");
  } else {
    stationLinkBtn.classList.add("hidden");
  }

  resultPanelEl.classList.remove("hidden");

  revealTarget(target);

  if (won) launchConfetti();

  // 일일 도전 결과는 일반 통계와 섞이지 않도록 별도로 저장한다 (오늘 이미 플레이했는지 판단에도 쓰임).
  if (isDailyChallenge) {
    saveDailyResult({ date: getTodayDateString(), won, attempts, targetName: target.name });
  } else if (won && !isTutorial) {
    recordWin(attempts);
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

// 스트리머 사진을 containerEl 안에 채운다 — 사진 주소가 없거나 깨져 있으면(404 등)
// 이름 첫 글자로 대체한다. 정답 공개 사진(revealTarget)과 도감 사진 팝업(openDexPhoto)이 공유한다.
function renderStreamerPhoto(containerEl, streamer) {
  function showInitial() {
    containerEl.innerHTML =
      '<span class="reveal-initial">' + escapeHtml(streamer.name.slice(0, 1)) + "</span>";
  }

  if (streamer.photo) {
    const img = document.createElement("img");
    img.src = streamer.photo;
    img.alt = streamer.name;
    img.onerror = showInitial;
    containerEl.innerHTML = "";
    containerEl.appendChild(img);
  } else {
    showInitial();
  }
}

function revealTarget(streamer) {
  revealPhotoEl.classList.add("solved");
  revealNameEl.textContent = streamer.name;
  revealNameEl.classList.remove("hidden");
  renderStreamerPhoto(revealPhotoEl, streamer);
}

// ---------------------------------------------------------
// 튜토리얼: 실제 게임 화면을 그대로 플레이하면서 안내 배너로 설명을 덧붙인다.
// ---------------------------------------------------------
const TUTORIAL_STEPS = [
  {
    text: "이 게임은 힌트를 보고 숲(SOOP) 스트리머를 맞히는 게임이에요.\n아래 입력창에 스트리머 이름을 입력하고 '입력'을 눌러 첫 힌트를 확인해보세요!",
    highlight: () => guessBoxEl,
  },
  {
    text: "방금 나온 원(배지)들이 힌트예요! 파란 배경은 정답과 일치, 검정 배경은 불일치예요. 방송 시작·나이·애청자수 옆의 화살표(▲/▼)는 정답이 더 높은지 낮은지, 이름 초성 옆의 화살표(◀/▶)는 정답 이름의 초성이 가나다순으로 더 앞인지 뒤인지 알려줘요.",
    highlight: () => boardBodyEl,
  },
  {
    text: "소속 크루는 로고 이미지로 표시돼요 (이미지에 마우스를 올리면 크루 이름이 나와요). 이제 정답을 맞힐 때까지 계속 추측해보세요. 모르겠으면 '정답 보기'를 눌러도 돼요!",
    highlight: () => boardBodyEl,
  },
];

// 튜토리얼 정답은 매번 고정된 한 명이 아니라, 성별/소속크루/방송 시작/나이/애청자 수가 전부 채워져
// 비공개 정보가 하나도 없는 스트리머 중에서 무작위로 뽑는다 — 그래야 튜토리얼에서 보여주는 힌트
// 배지들이 항상 "비공개"나 "?" 없이 전부 실제 값으로 채워진 모습을 보여줄 수 있다.
function pickTutorialTarget() {
  const fullyKnown = streamers.filter((s) =>
    s.gender &&
    getCrewNames(s).length > 0 &&
    s.startYear != null &&
    s.age != null &&
    s.fanCount != null
  );
  const pool = fullyKnown.length > 0 ? fullyKnown : streamers; // 만에 하나 그런 스트리머가 없으면 안전하게 전체에서 뽑는다
  return pool[Math.floor(Math.random() * pool.length)];
}

function startTutorial() {
  isTutorial = true;
  tutorialStepIndex = 0;
  tutorialTitleEl.textContent = "튜토리얼"; // 일일 도전에서 "일일 도전"으로 바꿔놨을 수도 있으니 되돌려둔다
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

// 튜토리얼 중 정답을 맞히면(또는 포기하면) 안내 배너는 닫고,
// 결과 패널의 "다른 문제 도전하기" 버튼을 "메인화면으로 가기" 버튼으로 바꿔서 보여준다.
function showTutorialCompletion() {
  clearHighlights();
  tutorialBannerEl.classList.add("hidden");
  playAgainBtn.textContent = "🏠 메인화면으로 가기";
  playAgainBtn.dataset.mode = "tutorial-end";
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

// 통계 화면의 "통계 초기화" 버튼과 설정 팝업의 "통계 기록 초기화" 버튼이 공유하는 로직
function handleResetStats() {
  if (!confirm("통계를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  saveStats({ counts: {} });
  // 통계 화면이 지금 보이고 있으면 화면도 바로 갱신한다
  if (!statsScreenEl.classList.contains("hidden")) {
    renderStats();
  }
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
