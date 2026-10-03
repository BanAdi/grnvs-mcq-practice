const legacyQuestions = window.EXTRA_QUESTION_DATA || [];
const paperQuestions = window.PAPER_VARIANT_DATA || [];
const multiAnswerQuestions = window.MULTI_ANSWER_DATA || [];
const topicGuidance = {
  "Physical/Signal/Coding": "Apply the signal/coding definition or formula; the distractors usually mix units, coding goals, or unrelated protocol concepts.",
  "Ethernet/WLAN/L2": "Use Layer-2 forwarding and media-access rules; routing and transport behavior do not determine this answer.",
  "IPv4/IPv6/Routing": "Apply address scope, prefix, fragmentation, or longest-prefix rules exactly; similar-looking address families are common distractors.",
  NAT: "Trace the packet direction and distinguish source translation on the way out from destination translation on the reply path.",
  "TCP/UDP/Transport": "Separate connection semantics, reliability, flow control, congestion control, and socket API behavior.",
  "DNS/Application": "Use the DNS record or application-layer role literally; distractors often swap record targets, layers, or lookup directions.",
  "TLS/Byte Order": "Keep certificate trust and byte-order rules separate; private keys are never carried in certificates.",
};
const allQuestions = [...multiAnswerQuestions, ...paperQuestions, ...legacyQuestions].map((question) => ({
  ...question,
  topic: question.topic || "General",
  explanation: question.explanation || `Correct answer${question.answers.length > 1 ? "s" : ""}: ${question.answers.map((index) => question.options[index]).join("; ")}. ${topicGuidance[question.topic] || "The remaining choices conflict with the definition used in the papers."}`,
  sourceRefs: question.sourceRefs || ["GRNVS endterm/retake topic"],
}));

const stateKey = "grnvs-practice-state-v3";
const sessionKey = "grnvs-practice-session-v1";
const examLength = 18;
const examDurationSeconds = 30 * 60;
let records = {};
let current = 0;
let topic = "all";
let mode = "practice";
let search = "";
let order = allQuestions.map((_, index) => index);
let checked = false;
let examIndexes = [];
let examSelections = {};
let examSubmitted = false;
let examSecondsLeft = examDurationSeconds;
let examDeadline = null;
let timerHandle = null;
let optionOrders = {};

try {
  records = JSON.parse(localStorage.getItem(stateKey) || "{}");
} catch {
  records = {};
}

const el = {
  total: document.querySelector("#total-label"),
  sourceFilter: document.querySelector("#source-filter"),
  modeLabel: document.querySelector("#mode-label"),
  topic: document.querySelector("#topic-filter"),
  search: document.querySelector("#search"),
  score: document.querySelector("#score-label"),
  answered: document.querySelector("#answered-label"),
  weakest: document.querySelector("#weakest-label"),
  pos: document.querySelector("#question-position"),
  type: document.querySelector("#type-pill"),
  source: document.querySelector("#source-pill"),
  q: document.querySelector("#question-text"),
  options: document.querySelector("#option-list"),
  footnote: document.querySelector("#year-footnote"),
  feedback: document.querySelector("#feedback"),
  prev: document.querySelector("#prev-button"),
  next: document.querySelector("#next-button"),
  check: document.querySelector("#check-button"),
  show: document.querySelector("#show-button"),
  submit: document.querySelector("#submit-button"),
  timer: document.querySelector("#timer-label"),
  shuffle: document.querySelector("#shuffle-button"),
  retry: document.querySelector("#retry-button"),
  reset: document.querySelector("#reset-button"),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function save() {
  localStorage.setItem(stateKey, JSON.stringify(records));
}

function saveSession() {
  localStorage.setItem(sessionKey, JSON.stringify({
    mode,
    current,
    topic,
    search,
    order,
    checked,
    examIndexes,
    examSelections,
    examSubmitted,
    examSecondsLeft,
    examDeadline,
    optionOrders,
  }));
}

function validIndexList(values, length, requireComplete = false) {
  return Array.isArray(values)
    && (!requireComplete || values.length === length)
    && new Set(values).size === values.length
    && values.every((value) => Number.isInteger(value) && value >= 0 && value < length);
}

function restoreSession() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return;
  }
  if (!saved || typeof saved !== "object") return;

  if (["practice", "multi", "review", "exam"].includes(saved.mode)) mode = saved.mode;
  if (Number.isInteger(saved.current) && saved.current >= 0) current = saved.current;
  if (typeof saved.topic === "string") topic = saved.topic;
  if (typeof saved.search === "string") search = saved.search;
  if (validIndexList(saved.order, allQuestions.length, true)) order = saved.order;
  checked = saved.checked === true;
  examSubmitted = saved.examSubmitted === true;
  if (Number.isFinite(saved.examSecondsLeft)) examSecondsLeft = Math.max(0, Math.min(examDurationSeconds, Math.floor(saved.examSecondsLeft)));
  if (Number.isFinite(saved.examDeadline)) examDeadline = saved.examDeadline;

  if (validIndexList(saved.examIndexes, allQuestions.length) && saved.examIndexes.length <= examLength) {
    examIndexes = saved.examIndexes;
  }

  if (saved.examSelections && typeof saved.examSelections === "object") {
    examSelections = {};
    allQuestions.forEach((question) => {
      const values = saved.examSelections[question.id];
      if (validIndexList(values, question.options.length)) examSelections[question.id] = values;
    });
  }

  if (saved.optionOrders && typeof saved.optionOrders === "object") {
    optionOrders = {};
    allQuestions.forEach((question) => {
      const values = saved.optionOrders[question.id];
      if (validIndexList(values, question.options.length, true)) optionOrders[question.id] = values;
    });
  }
}

function isSameSet(a, b) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function recordFor(question) {
  return records[question.id] || { selected: [], attempts: 0, firstCorrect: null, lastCorrect: null, revealed: false };
}

function setRecord(question, patch) {
  records[question.id] = { ...recordFor(question), ...patch };
  save();
}

function selectedFor(question) {
  return mode === "exam" ? examSelections[question.id] || [] : recordFor(question).selected || [];
}

function setSelected(question, values) {
  if (mode === "exam") {
    if (values.length) examSelections[question.id] = values;
    else delete examSelections[question.id];
    return;
  }
  setRecord(question, { selected: values });
}

function configureTopics() {
  const topics = [...new Set(allQuestions.map((question) => question.topic))].sort();
  el.topic.innerHTML = `<option value="all">All topics</option>${topics.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function randomIndex(upperBound) {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % upperBound;
  }
  return Math.floor(Math.random() * upperBound);
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function shuffledIndexes() {
  return shuffled(allQuestions.map((_, index) => index));
}

function reshuffleOptions(question) {
  if (!question) return;
  const previous = optionOrders[question.id];
  const next = shuffled(question.options.map((_, index) => index));
  if (previous && next.length > 1 && next.every((value, index) => value === previous[index])) {
    [next[0], next[1]] = [next[1], next[0]];
  }
  optionOrders[question.id] = next;
}

function optionOrderFor(question) {
  if (!optionOrders[question.id]) reshuffleOptions(question);
  return optionOrders[question.id];
}

function answerLetters(question, indexes) {
  const optionOrder = optionOrderFor(question);
  return indexes
    .map((index) => optionOrder.indexOf(index))
    .sort((a, b) => a - b)
    .map((index) => String.fromCharCode(65 + index))
    .join(", ");
}

function updateExamTime() {
  if (!examDeadline || examSubmitted) return;
  examSecondsLeft = Math.max(0, Math.ceil((examDeadline - Date.now()) / 1000));
}

function runExamTimer() {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    updateExamTime();
    renderTimer();
    if (examSecondsLeft <= 0) submitExam();
  }, 1000);
}

function startExam() {
  clearInterval(timerHandle);
  examIndexes = shuffledIndexes().slice(0, Math.min(examLength, allQuestions.length));
  examSelections = {};
  examSubmitted = false;
  examSecondsLeft = examDurationSeconds;
  examDeadline = Date.now() + examDurationSeconds * 1000;
  optionOrders = {};
  current = 0;
  checked = false;
  runExamTimer();
}

function setMode(nextMode) {
  mode = nextMode;
  current = 0;
  checked = false;
  search = "";
  el.search.value = "";
  if (mode === "exam") startExam();
  else {
    clearInterval(timerHandle);
    optionOrders = {};
  }
  render();
}

function filteredIndexes() {
  if (mode === "exam") return examIndexes;
  const needle = search.trim().toLowerCase();
  return order.filter((index) => {
    const question = allQuestions[index];
    const record = recordFor(question);
    if (mode === "multi" && !question.multiple) return false;
    if (mode === "review" && !(record.revealed || record.lastCorrect === false)) return false;
    if (topic !== "all" && question.topic !== topic) return false;
    if (!needle) return true;
    return `${question.question} ${question.options.join(" ")} ${question.topic} ${question.sourceRefs.join(" ")}`.toLowerCase().includes(needle);
  });
}

function activeQuestion() {
  const list = filteredIndexes();
  if (current >= list.length) current = Math.max(0, list.length - 1);
  return allQuestions[list[current]];
}

function answerBreakdown(question) {
  const selected = selectedFor(question);
  const correctChosen = selected.filter((value) => question.answers.includes(value)).length;
  const wrongChosen = selected.filter((value) => !question.answers.includes(value)).length;
  const missed = question.answers.length - correctChosen;
  const rawPoints = question.multiple
    ? Math.max(0, correctChosen - wrongChosen)
    : isSameSet(selected, question.answers) ? 1 : 0;
  const availablePoints = question.multiple ? question.answers.length : 1;
  return { correctChosen, wrongChosen, missed, rawPoints, availablePoints };
}

function examPoints(question) {
  const score = answerBreakdown(question);
  return score.rawPoints / score.availablePoints;
}

function submitExam() {
  if (mode !== "exam" || examSubmitted) return;
  updateExamTime();
  examSubmitted = true;
  clearInterval(timerHandle);
  checked = true;
  render();
}

function renderTimer() {
  const minutes = Math.floor(Math.max(0, examSecondsLeft) / 60);
  const seconds = Math.max(0, examSecondsLeft) % 60;
  el.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderStats() {
  const attempted = allQuestions.filter((question) => recordFor(question).attempts > 0);
  const firstCorrect = attempted.filter((question) => recordFor(question).firstCorrect).length;
  el.score.textContent = `${firstCorrect}/${attempted.length}`;
  el.answered.textContent = String(attempted.length);
  const topicRows = [...new Set(allQuestions.map((question) => question.topic))].map((name) => {
    const questions = attempted.filter((question) => question.topic === name);
    const correct = questions.filter((question) => recordFor(question).lastCorrect).length;
    return { name, attempted: questions.length, rate: questions.length ? correct / questions.length : 1 };
  }).filter((row) => row.attempted > 0).sort((a, b) => a.rate - b.rate || b.attempted - a.attempted);
  el.weakest.textContent = topicRows[0] ? `${topicRows[0].name} · ${Math.round(topicRows[0].rate * 100)}%` : "Answer a few questions";
}

function renderFeedback(question) {
  if ((mode === "exam" && !examSubmitted) || !checked) {
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    return;
  }
  const selected = selectedFor(question);
  const ok = isSameSet(selected, question.answers);
  const answerText = answerLetters(question, question.answers);
  const selectedText = answerLetters(question, selected);
  const score = answerBreakdown(question);
  const scoringText = question.multiple
    ? `<em>Exam-style score: ${score.rawPoints}/${score.availablePoints} · ${score.correctChosen} correct selected · ${score.wrongChosen} wrong selected · ${score.missed} missed</em>`
    : "";
  el.feedback.className = ok ? "feedback visible good" : "feedback visible bad";
  const resultText = ok
    ? `Correct · Your answer: ${selectedText}.`
    : selected.length
      ? `Your answer: ${selectedText}. Correct answer${question.answers.length > 1 ? "s" : ""}: ${answerText}.`
      : `No answer selected. Correct answer${question.answers.length > 1 ? "s" : ""}: ${answerText}.`;
  el.feedback.innerHTML = `<strong>${resultText}</strong>${scoringText}<span>${escapeHtml(question.explanation)}</span>`;
}

function render() {
  const list = filteredIndexes();
  const modeNames = { practice: "Paper-grounded topic practice", multi: "Multiple-answer drill · select every correct option", review: "Mistakes and revealed answers", exam: "Timed 18-question exam" };
  el.modeLabel.textContent = modeNames[mode];
  const multipleCount = allQuestions.filter((question) => question.multiple).length;
  el.total.textContent = `${allQuestions.length} questions · ${multipleCount} multiple-answer · 9 papers`;
  el.timer.hidden = mode !== "exam";
  el.submit.hidden = mode !== "exam";
  el.check.hidden = mode === "exam";
  el.show.hidden = mode === "exam";
  el.shuffle.hidden = mode === "exam";
  el.retry.hidden = mode === "exam";
  renderTimer();

  if (!list.length) {
    el.pos.textContent = mode === "review" ? "No review questions yet" : "No questions found";
    el.q.textContent = mode === "review" ? "Questions you answer incorrectly or reveal will appear here." : "Try another topic or search term.";
    el.options.innerHTML = "";
    el.footnote.textContent = "";
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    renderStats();
    saveSession();
    return;
  }

  const question = activeQuestion();
  const selected = selectedFor(question);
  const optionOrder = optionOrderFor(question);
  el.pos.textContent = `Question ${current + 1} of ${list.length}`;
  el.type.textContent = question.multiple ? "Multiple answers" : "Single answer";
  el.source.textContent = question.topic;
  el.q.textContent = question.question;
  el.footnote.textContent = `Grounded in: ${question.sourceRefs.join(" · ")}`;
  el.prev.disabled = current === 0;
  el.next.disabled = current === list.length - 1;
  el.options.innerHTML = "";

  optionOrder.forEach((index, displayIndex) => {
    const option = question.options[index];
    const button = document.createElement("button");
    const chosen = selected.includes(index);
    const showResult = checked && (mode !== "exam" || examSubmitted);
    const correct = question.answers.includes(index);
    button.className = "option";
    if (chosen) button.classList.add("selected");
    if (showResult) {
      if (correct) button.classList.add("correct");
      if (chosen && !correct) button.classList.add("wrong");
      if (!chosen && correct) button.classList.add("missed");
    }
    button.disabled = mode === "exam" && examSubmitted;
    const resultLabel = !showResult
      ? ""
      : chosen && correct
        ? "Your answer · Correct"
        : chosen
          ? "Your answer · Incorrect"
          : correct
            ? "Correct answer · Not selected"
            : "";
    button.innerHTML = `<span>${String.fromCharCode(65 + displayIndex)}</span><strong>${escapeHtml(option)}</strong>${resultLabel ? `<small class="option-result">${resultLabel}</small>` : ""}`;
    button.addEventListener("click", () => {
      const next = question.multiple ? toggle(selected, index) : [index];
      checked = false;
      setSelected(question, next);
      render();
    });
    el.options.appendChild(button);
  });

  if (mode === "exam" && examSubmitted) {
    const points = list.reduce((sum, index) => sum + examPoints(allQuestions[index]), 0);
    const percent = Math.round((points / list.length) * 100);
    el.modeLabel.textContent = `Exam submitted · ${points.toFixed(1)}/${list.length} points (${percent}%)`;
  }
  renderFeedback(question);
  renderStats();
  saveSession();
}

function toggle(values, index) {
  return values.includes(index) ? values.filter((value) => value !== index) : [...values, index].sort((a, b) => a - b);
}

function shuffle() {
  order = shuffledIndexes();
  optionOrders = {};
  current = 0;
  checked = false;
  render();
}

function checkAnswer() {
  const question = activeQuestion();
  const selected = selectedFor(question);
  if (!selected.length) return;
  const correct = isSameSet(selected, question.answers);
  const record = recordFor(question);
  setRecord(question, { attempts: record.attempts + 1, firstCorrect: record.firstCorrect === null ? correct : record.firstCorrect, lastCorrect: correct });
  checked = true;
  render();
}

function showAnswer() {
  const question = activeQuestion();
  setRecord(question, { revealed: true });
  checked = true;
  render();
}

function navigateQuestions(direction) {
  const list = filteredIndexes();
  const destination = Math.max(0, Math.min(list.length - 1, current + direction));
  if (!list.length || destination === current) return;
  current = destination;
  checked = mode === "exam" && examSubmitted;
  reshuffleOptions(activeQuestion());
  render();
}

function isTypingTarget(target) {
  return target instanceof Element && (target.matches("input, textarea, select") || target.isContentEditable);
}

restoreSession();
configureTopics();
if (![...el.topic.options].some((option) => option.value === topic)) topic = "all";
el.sourceFilter.value = mode;
el.topic.value = topic;
el.search.value = search;
if (mode === "exam") {
  if (!examIndexes.length) {
    startExam();
  } else if (!examSubmitted) {
    updateExamTime();
    if (examSecondsLeft <= 0) {
      examSubmitted = true;
      checked = true;
    } else {
      runExamTimer();
    }
  } else {
    checked = true;
  }
}
el.sourceFilter.addEventListener("change", (event) => setMode(event.target.value));
el.topic.addEventListener("change", (event) => { topic = event.target.value; current = 0; checked = false; optionOrders = {}; render(); });
el.search.addEventListener("input", (event) => { search = event.target.value; current = 0; checked = false; optionOrders = {}; render(); });
el.prev.addEventListener("click", () => navigateQuestions(-1));
el.next.addEventListener("click", () => navigateQuestions(1));
el.check.addEventListener("click", checkAnswer);
el.show.addEventListener("click", showAnswer);
el.submit.addEventListener("click", submitExam);
el.shuffle.addEventListener("click", shuffle);
el.retry.addEventListener("click", () => { el.sourceFilter.value = "review"; setMode("review"); });
el.reset.addEventListener("click", () => { records = {}; checked = false; save(); render(); });
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTypingTarget(event.target)) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigateQuestions(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    navigateQuestions(1);
  }
});
render();
