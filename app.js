const exams = window.QUIZ_DATA || [];
const totalQuestions = exams.reduce((sum, exam) => sum + exam.questionCount, 0);

let activeId = exams[0]?.id || "";
let mode = "practice";
let done = {};

const list = document.querySelector("#exam-list");
const grid = document.querySelector("#paper-grid");
const title = document.querySelector("#exam-title");
const source = document.querySelector("#source-file");
const search = document.querySelector("#search");
const doneButton = document.querySelector("#done-button");
const total = document.querySelector("#question-total");
const progressValue = document.querySelector("#progress-value");
const progressMeter = document.querySelector("#progress-meter");
const modeButtons = [...document.querySelectorAll("[data-mode]")];

try {
  done = JSON.parse(localStorage.getItem("grnvs-mcq-progress") || "{}");
} catch {
  done = {};
}

total.textContent = `${totalQuestions} questions from official solution sheets`;

function saveProgress() {
  localStorage.setItem("grnvs-mcq-progress", JSON.stringify(done));
}

function activeExam() {
  return exams.find((exam) => exam.id === activeId) || exams[0];
}

function filteredExams() {
  const normalized = search.value.trim().toLowerCase();
  if (!normalized) return exams;
  return exams.filter((exam) => {
    return (
      exam.title.toLowerCase().includes(normalized) ||
      exam.file.toLowerCase().includes(normalized) ||
      exam.content.toLowerCase().includes(normalized)
    );
  });
}

function updateProgress() {
  const completed = exams.reduce((sum, exam) => {
    return sum + (done[exam.id] ? exam.questionCount : 0);
  }, 0);
  const progress = Math.round((completed / totalQuestions) * 100);
  progressValue.textContent = `${progress}%`;
  progressMeter.value = progress;
}

function renderList() {
  list.innerHTML = "";
  for (const exam of filteredExams()) {
    const button = document.createElement("button");
    button.className = exam.id === activeId ? "exam active" : "exam";
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(exam.title)}</strong>
        <small>${exam.questionCount} questions</small>
      </span>
      <span class="${done[exam.id] ? "status done" : "status"}">
        ${done[exam.id] ? "Done" : "Open"}
      </span>
    `;
    button.addEventListener("click", () => {
      activeId = exam.id;
      render();
    });
    list.appendChild(button);
  }
}

function paper(label, sublabel, text, answerSheet = false) {
  const article = document.createElement("article");
  article.className = answerSheet ? "paper answer-sheet" : "paper";
  article.innerHTML = `
    <div class="paper-header">
      <strong>${label}</strong>
      <span>${sublabel}</span>
    </div>
  `;
  const pre = document.createElement("pre");
  pre.textContent = text;
  article.appendChild(pre);
  return article;
}

function renderPaper() {
  const exam = activeExam();
  title.textContent = exam.title;
  source.textContent = exam.file;
  doneButton.textContent = done[exam.id] ? "Mark Open" : "Mark Done";
  doneButton.className = done[exam.id] ? "primary muted" : "primary";
  grid.className = mode === "split" ? "paper-grid split" : "paper-grid";
  grid.innerHTML = "";

  if (mode === "practice" || mode === "split") {
    grid.appendChild(paper("Practice Sheet", "answer marks hidden", exam.practice));
  }
  if (mode === "answers" || mode === "split") {
    grid.appendChild(
      paper("Official Answers", "official × marks shown", exam.content, true),
    );
  }
}

function renderModes() {
  for (const button of modeButtons) {
    button.classList.toggle("selected", button.dataset.mode === mode);
  }
}

function render() {
  renderList();
  renderModes();
  renderPaper();
  updateProgress();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

search.addEventListener("input", renderList);

doneButton.addEventListener("click", () => {
  const exam = activeExam();
  done[exam.id] = !done[exam.id];
  saveProgress();
  render();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    render();
  });
}

render();
