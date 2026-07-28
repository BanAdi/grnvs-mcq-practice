const allQuestions = window.QUESTION_DATA || [];
const stateKey = "grnvs-card-answers-v1";

let answers = {};
let current = 0;
let year = "all";
let search = "";
let order = allQuestions.map((_, index) => index);
let checked = false;

try {
  answers = JSON.parse(localStorage.getItem(stateKey) || "{}");
} catch {
  answers = {};
}

const el = {
  total: document.querySelector("#total-label"),
  year: document.querySelector("#year-filter"),
  search: document.querySelector("#search"),
  score: document.querySelector("#score-label"),
  answered: document.querySelector("#answered-label"),
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
  shuffle: document.querySelector("#shuffle-button"),
  reset: document.querySelector("#reset-button"),
};

const years = [...new Set(allQuestions.map((q) => q.year))].sort();
el.year.innerHTML = `<option value="all">All years</option>${years
  .map((value) => `<option value="${value}">${value}</option>`)
  .join("")}`;
el.total.textContent = `${allQuestions.length} questions`;

function save() {
  localStorage.setItem(stateKey, JSON.stringify(answers));
}

function filteredIndexes() {
  const needle = search.trim().toLowerCase();
  return order.filter((index) => {
    const q = allQuestions[index];
    if (year !== "all" && q.year !== year) return false;
    if (!needle) return true;
    return `${q.question} ${q.options.join(" ")} ${q.source}`.toLowerCase().includes(needle);
  });
}

function activeIndex() {
  const list = filteredIndexes();
  if (current >= list.length) current = Math.max(0, list.length - 1);
  return list[current];
}

function activeQuestion() {
  return allQuestions[activeIndex()];
}

function isSameSet(a, b) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function selectedFor(q) {
  return answers[q.id] || [];
}

function setSelected(q, values) {
  answers[q.id] = values;
  if (values.length === 0) delete answers[q.id];
  save();
}

function renderStats() {
  let answered = 0;
  let correct = 0;
  for (const q of allQuestions) {
    const selected = selectedFor(q);
    if (selected.length) answered += 1;
    if (selected.length && isSameSet(selected, q.answers)) correct += 1;
  }
  el.score.textContent = `${correct}/${allQuestions.length}`;
  el.answered.textContent = String(answered);
}

function render() {
  const list = filteredIndexes();
  if (!list.length) {
    el.pos.textContent = "No questions found";
    el.q.textContent = "Try a different year or search term.";
    el.options.innerHTML = "";
    el.footnote.textContent = "";
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    renderStats();
    return;
  }

  const q = activeQuestion();
  const selected = selectedFor(q);
  el.pos.textContent = `Question ${current + 1} of ${list.length}`;
  el.type.textContent = q.multiple ? "Multiple answers" : "Single answer";
  el.source.textContent = `${q.source}, ${q.label})`;
  el.q.textContent = q.question;
  el.footnote.textContent = `Asked in ${q.year} (${q.exam}).`;
  el.prev.disabled = current === 0;
  el.next.disabled = current === list.length - 1;
  el.options.innerHTML = "";

  q.options.forEach((option, index) => {
    const button = document.createElement("button");
    const chosen = selected.includes(index);
    button.className = "option";
    if (chosen) button.classList.add("selected");
    if (checked) {
      if (q.answers.includes(index)) button.classList.add("correct");
      if (chosen && !q.answers.includes(index)) button.classList.add("wrong");
      if (!chosen && q.answers.includes(index)) button.classList.add("missed");
    }
    button.innerHTML = `<span>${String.fromCharCode(65 + index)}</span><strong>${escapeHtml(option)}</strong>`;
    button.addEventListener("click", () => {
      const next = q.multiple
        ? toggle(selected, index)
        : selected.includes(index)
          ? []
          : [index];
      checked = false;
      setSelected(q, next);
      render();
    });
    el.options.appendChild(button);
  });

  renderFeedback(q);
  renderStats();
}

function renderFeedback(q) {
  const selected = selectedFor(q);
  if (!checked) {
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    return;
  }
  const ok = isSameSet(selected, q.answers);
  el.feedback.className = ok ? "feedback visible good" : "feedback visible bad";
  const answerText = q.answers.map((index) => String.fromCharCode(65 + index)).join(", ");
  el.feedback.textContent = ok
    ? "Correct."
    : `Not quite. Correct answer${q.answers.length > 1 ? "s" : ""}: ${answerText}.`;
}

function toggle(values, index) {
  return values.includes(index)
    ? values.filter((value) => value !== index)
    : [...values, index].sort((a, b) => a - b);
}

function shuffle() {
  order = order
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
  current = 0;
  checked = false;
  render();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

el.year.addEventListener("change", (event) => {
  year = event.target.value;
  current = 0;
  checked = false;
  render();
});

el.search.addEventListener("input", (event) => {
  search = event.target.value;
  current = 0;
  checked = false;
  render();
});

el.prev.addEventListener("click", () => {
  current = Math.max(0, current - 1);
  checked = false;
  render();
});

el.next.addEventListener("click", () => {
  current = Math.min(filteredIndexes().length - 1, current + 1);
  checked = false;
  render();
});

el.check.addEventListener("click", () => {
  checked = true;
  render();
});

el.show.addEventListener("click", () => {
  const q = activeQuestion();
  setSelected(q, [...q.answers]);
  checked = true;
  render();
});

el.shuffle.addEventListener("click", shuffle);

el.reset.addEventListener("click", () => {
  answers = {};
  checked = false;
  save();
  render();
});

render();
