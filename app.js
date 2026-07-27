const exams = window.PAGE_QUIZ_DATA || [];
const totalOptions = exams.reduce((sum, exam) => {
  return sum + exam.sections.reduce((sectionSum, section) => sectionSum + section.optionCount, 0);
}, 0);

let activeExamId = exams[0]?.id || "";
let activeSectionIndex = 0;
let query = "";
let revealed = false;
let checked = false;
let selected = {};

const list = document.querySelector("#exam-list");
const stack = document.querySelector("#page-stack");
const title = document.querySelector("#exam-title");
const source = document.querySelector("#source-file");
const search = document.querySelector("#search");
const checkButton = document.querySelector("#check-button");
const revealButton = document.querySelector("#reveal-button");
const resetButton = document.querySelector("#reset-button");
const total = document.querySelector("#question-total");
const progressValue = document.querySelector("#progress-value");
const progressMeter = document.querySelector("#progress-meter");
const resultBar = document.querySelector("#result-bar");
const sectionTabs = document.querySelector("#section-tabs");

try {
  selected = JSON.parse(localStorage.getItem("grnvs-mcq-selections") || "{}");
} catch {
  selected = {};
}

total.textContent = `${totalOptions} selectable options from official solution sheets`;

function save() {
  localStorage.setItem("grnvs-mcq-selections", JSON.stringify(selected));
}

function activeExam() {
  return exams.find((exam) => exam.id === activeExamId) || exams[0];
}

function activeSection() {
  return activeExam().sections[activeSectionIndex] || activeExam().sections[0];
}

function sectionKey(exam = activeExam(), section = activeSection()) {
  return `${exam.id}--${section.task}`;
}

function selectedForCurrent() {
  return selected[sectionKey()] || {};
}

function setSelectedForCurrent(next) {
  selected[sectionKey()] = next;
  save();
}

function filteredExams() {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return exams;
  return exams.filter((exam) => {
    return (
      exam.title.toLowerCase().includes(normalized) ||
      exam.file.toLowerCase().includes(normalized)
    );
  });
}

function sectionStats(exam, section) {
  const answers = selected[`${exam.id}--${section.task}`] || {};
  let chosen = 0;
  for (const page of section.pages) {
    for (const widget of page.widgets) {
      if (answers[widget.id]) chosen += 1;
    }
  }
  return chosen;
}

function scoreCurrent() {
  const answers = selectedForCurrent();
  let correctChosen = 0;
  let wrongChosen = 0;
  let missed = 0;
  let untouched = 0;

  for (const page of activeSection().pages) {
    for (const widget of page.widgets) {
      const isChosen = Boolean(answers[widget.id]);
      if (isChosen && widget.correct) correctChosen += 1;
      if (isChosen && !widget.correct) wrongChosen += 1;
      if (!isChosen && widget.correct) missed += 1;
      if (!isChosen && !widget.correct) untouched += 1;
    }
  }

  return { correctChosen, wrongChosen, missed, untouched };
}

function updateProgress() {
  let chosen = 0;
  for (const exam of exams) {
    for (const section of exam.sections) {
      chosen += sectionStats(exam, section);
    }
  }
  progressValue.textContent = `${chosen}/${totalOptions}`;
  progressMeter.max = totalOptions;
  progressMeter.value = chosen;
}

function renderList() {
  list.innerHTML = "";
  for (const exam of filteredExams()) {
    const optionCount = exam.sections.reduce((sum, section) => sum + section.optionCount, 0);
    const chosen = exam.sections.reduce((sum, section) => sum + sectionStats(exam, section), 0);
    const button = document.createElement("button");
    button.className = exam.id === activeExamId ? "exam active" : "exam";
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(exam.title)}</strong>
        <small>${exam.sections.length} section${exam.sections.length === 1 ? "" : "s"} · ${optionCount} options</small>
      </span>
      <span class="${chosen > 0 ? "status done" : "status"}">${chosen}</span>
    `;
    button.addEventListener("click", () => {
      activeExamId = exam.id;
      activeSectionIndex = 0;
      checked = false;
      revealed = false;
      render();
    });
    list.appendChild(button);
  }
}

function renderTabs() {
  sectionTabs.innerHTML = "";
  const exam = activeExam();
  sectionTabs.style.display = exam.sections.length > 1 ? "inline-grid" : "none";
  sectionTabs.style.gridTemplateColumns = `repeat(${exam.sections.length}, 1fr)`;
  exam.sections.forEach((section, index) => {
    const button = document.createElement("button");
    button.className = index === activeSectionIndex ? "selected" : "";
    button.textContent = section.title;
    button.addEventListener("click", () => {
      activeSectionIndex = index;
      checked = false;
      revealed = false;
      render();
    });
    sectionTabs.appendChild(button);
  });
}

function renderResult() {
  const score = scoreCurrent();
  resultBar.className = checked || revealed ? "result-bar visible" : "result-bar";
  if (!checked && !revealed) {
    resultBar.textContent = "";
    return;
  }
  resultBar.innerHTML = `
    <strong>${score.correctChosen} correct selected</strong>
    <span>${score.missed} missed</span>
    <span>${score.wrongChosen} wrong selected</span>
  `;
}

function renderPages() {
  const exam = activeExam();
  const section = activeSection();
  const answers = selectedForCurrent();
  title.textContent = `${exam.title} · ${section.title}`;
  source.textContent = exam.file;
  revealButton.textContent = revealed ? "Hide" : "Reveal";
  stack.innerHTML = "";

  for (const page of section.pages) {
    const viewer = document.createElement("article");
    viewer.className = "page-viewer";
    viewer.innerHTML = `
      <div class="page-header">
        <strong>Page ${page.pageNumber}</strong>
        <span>${section.answerCount} official correct selections in this section</span>
      </div>
      <div class="page-canvas">
        <img src="${page.image}" alt="${escapeHtml(exam.title)} ${section.title} page ${page.pageNumber}" />
      </div>
    `;

    const canvas = viewer.querySelector(".page-canvas");
    for (const cover of page.covers) {
      canvas.appendChild(positioned("span", "solution-cover", cover));
    }

    for (const widget of page.widgets) {
      const button = positioned("button", "choice", widget);
      const chosen = Boolean(answers[widget.id]);
      button.type = "button";
      button.setAttribute("aria-label", `Toggle answer ${widget.id}`);
      button.classList.toggle("chosen", chosen);
      if (checked || revealed) {
        button.classList.toggle("correct", widget.correct);
        button.classList.toggle("wrong", chosen && !widget.correct);
        button.classList.toggle("missed", !chosen && widget.correct);
      }
      if (revealed && widget.correct) {
        button.classList.add("chosen");
      }
      button.addEventListener("click", () => {
        const next = { ...selectedForCurrent(), [widget.id]: !chosen };
        if (!next[widget.id]) delete next[widget.id];
        setSelectedForCurrent(next);
        checked = false;
        render();
      });
      canvas.appendChild(button);
    }

    stack.appendChild(viewer);
  }
}

function positioned(tag, className, widget) {
  const element = document.createElement(tag);
  element.className = className;
  element.style.left = `${widget.left}%`;
  element.style.top = `${widget.top}%`;
  element.style.width = `${widget.width}%`;
  element.style.height = `${widget.height}%`;
  return element;
}

function render() {
  renderList();
  renderTabs();
  renderResult();
  renderPages();
  updateProgress();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

search.addEventListener("input", (event) => {
  query = event.target.value;
  renderList();
});

checkButton.addEventListener("click", () => {
  checked = true;
  revealed = false;
  render();
});

revealButton.addEventListener("click", () => {
  revealed = !revealed;
  checked = revealed;
  render();
});

resetButton.addEventListener("click", () => {
  delete selected[sectionKey()];
  save();
  checked = false;
  revealed = false;
  render();
});

render();
