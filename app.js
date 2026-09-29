const legacyQuestions = window.EXTRA_QUESTION_DATA || [];
const paperQuestions = window.PAPER_VARIANT_DATA || [];
const topicGuidance = {
  "Physical/Signal/Coding": "Apply the signal/coding definition or formula; the distractors usually mix units, coding goals, or unrelated protocol concepts.",
  "Ethernet/WLAN/L2": "Use Layer-2 forwarding and media-access rules; routing and transport behavior do not determine this answer.",
  "IPv4/IPv6/Routing": "Apply address scope, prefix, fragmentation, or longest-prefix rules exactly; similar-looking address families are common distractors.",
  NAT: "Trace the packet direction and distinguish source translation on the way out from destination translation on the reply path.",
  "TCP/UDP/Transport": "Separate connection semantics, reliability, flow control, congestion control, and socket API behavior.",
  "DNS/Application": "Use the DNS record or application-layer role literally; distractors often swap record targets, layers, or lookup directions.",
  "TLS/Byte Order": "Keep certificate trust and byte-order rules separate; private keys are never carried in certificates.",
};
const allQuestions = [...paperQuestions, ...legacyQuestions].map((question) => ({
  ...question,
  topic: question.topic || "General",
  explanation: question.explanation || `Correct answer${question.answers.length > 1 ? "s" : ""}: ${question.answers.map((index) => question.options[index]).join("; ")}. ${topicGuidance[question.topic] || "The remaining choices conflict with the definition used in the papers."}`,
  sourceRefs: question.sourceRefs || ["GRNVS endterm/retake topic"],
}));

const stateKey = "grnvs-practice-state-v3";
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
let timerHandle = null;

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

function shuffledIndexes() {
  return allQuestions.map((_, index) => index).map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map((item) => item.value);
}

function startExam() {
  clearInterval(timerHandle);
  examIndexes = shuffledIndexes().slice(0, Math.min(examLength, allQuestions.length));
  examSelections = {};
  examSubmitted = false;
  examSecondsLeft = examDurationSeconds;
  current = 0;
  checked = false;
  timerHandle = setInterval(() => {
    examSecondsLeft -= 1;
    renderTimer();
    if (examSecondsLeft <= 0) submitExam();
  }, 1000);
}

function setMode(nextMode) {
  mode = nextMode;
  current = 0;
  checked = false;
  search = "";
  el.search.value = "";
  if (mode === "exam") startExam();
  else clearInterval(timerHandle);
  render();
}

function filteredIndexes() {
  if (mode === "exam") return examIndexes;
  const needle = search.trim().toLowerCase();
  return order.filter((index) => {
    const question = allQuestions[index];
    const record = recordFor(question);
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

function examPoints(question) {
  const selected = selectedFor(question);
  if (!question.multiple) return isSameSet(selected, question.answers) ? 1 : 0;
  const correctChosen = selected.filter((value) => question.answers.includes(value)).length;
  const wrongChosen = selected.filter((value) => !question.answers.includes(value)).length;
  return Math.max(0, correctChosen - wrongChosen) / question.answers.length;
}

function submitExam() {
  if (mode !== "exam" || examSubmitted) return;
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
  const answerText = question.answers.map((index) => String.fromCharCode(65 + index)).join(", ");
  el.feedback.className = ok ? "feedback visible good" : "feedback visible bad";
  el.feedback.innerHTML = `<strong>${ok ? "Correct." : `Correct answer${question.answers.length > 1 ? "s" : ""}: ${answerText}.`}</strong><span>${escapeHtml(question.explanation)}</span>`;
}

function render() {
  const list = filteredIndexes();
  const modeNames = { practice: "Paper-grounded topic practice", review: "Mistakes and revealed answers", exam: "Timed 18-question exam" };
  el.modeLabel.textContent = modeNames[mode];
  el.total.textContent = `${allQuestions.length} relevant topic questions · 9 original papers`;
  el.timer.hidden = mode !== "exam";
  el.submit.hidden = mode !== "exam";
  el.check.hidden = mode === "exam";
  el.show.hidden = mode === "exam";
  el.shuffle.hidden = mode === "exam";
  el.retry.hidden = mode === "exam";
  renderTimer();

  if (!list.length) {
    el.pos.textContent = "No review questions yet";
    el.q.textContent = "Questions you answer incorrectly or reveal will appear here.";
    el.options.innerHTML = "";
    el.footnote.textContent = "";
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    renderStats();
    return;
  }

  const question = activeQuestion();
  const selected = selectedFor(question);
  el.pos.textContent = `Question ${current + 1} of ${list.length}`;
  el.type.textContent = question.multiple ? "Multiple answers" : "Single answer";
  el.source.textContent = question.topic;
  el.q.textContent = question.question;
  el.footnote.textContent = `Grounded in: ${question.sourceRefs.join(" · ")}`;
  el.prev.disabled = current === 0;
  el.next.disabled = current === list.length - 1;
  el.options.innerHTML = "";

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    const chosen = selected.includes(index);
    const showResult = checked && (mode !== "exam" || examSubmitted);
    button.className = "option";
    if (chosen) button.classList.add("selected");
    if (showResult) {
      if (question.answers.includes(index)) button.classList.add("correct");
      if (chosen && !question.answers.includes(index)) button.classList.add("wrong");
      if (!chosen && question.answers.includes(index)) button.classList.add("missed");
    }
    button.disabled = mode === "exam" && examSubmitted;
    button.innerHTML = `<span>${String.fromCharCode(65 + index)}</span><strong>${escapeHtml(option)}</strong>`;
    button.addEventListener("click", () => {
      const next = question.multiple ? toggle(selected, index) : selected.includes(index) ? [] : [index];
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
}

function toggle(values, index) {
  return values.includes(index) ? values.filter((value) => value !== index) : [...values, index].sort((a, b) => a - b);
}

function shuffle() {
  order = shuffledIndexes();
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

configureTopics();
el.sourceFilter.addEventListener("change", (event) => setMode(event.target.value));
el.topic.addEventListener("change", (event) => { topic = event.target.value; current = 0; checked = false; render(); });
el.search.addEventListener("input", (event) => { search = event.target.value; current = 0; checked = false; render(); });
el.prev.addEventListener("click", () => { current = Math.max(0, current - 1); checked = mode === "exam" && examSubmitted; render(); });
el.next.addEventListener("click", () => { current = Math.min(filteredIndexes().length - 1, current + 1); checked = mode === "exam" && examSubmitted; render(); });
el.check.addEventListener("click", checkAnswer);
el.show.addEventListener("click", showAnswer);
el.submit.addEventListener("click", submitExam);
el.shuffle.addEventListener("click", shuffle);
el.retry.addEventListener("click", () => { el.sourceFilter.value = "review"; setMode("review"); });
el.reset.addEventListener("click", () => { records = {}; checked = false; save(); render(); });
render();
