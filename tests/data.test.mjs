import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function load(files) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context.window;
}

test("topic questions have unique IDs and valid answers", () => {
  const data = load(["extra-questions-data.js", "paper-variants-data.js"]);
  const questions = [...data.EXTRA_QUESTION_DATA, ...data.PAPER_VARIANT_DATA];
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.length >= 140);
  for (const question of questions) {
    assert.ok(question.question);
    assert.ok(question.topic);
    assert.ok(question.options.length >= 2);
    assert.ok(question.answers.length >= 1);
    assert.ok(question.answers.every((index) => index >= 0 && index < question.options.length));
  }
});

test("paper-derived variants include explanations and exact source references", () => {
  const { PAPER_VARIANT_DATA: questions } = load(["paper-variants-data.js"]);
  for (const question of questions) {
    assert.ok(question.explanation.length >= 20, question.id);
    assert.ok(question.sourceRefs.length >= 1, question.id);
    assert.ok(question.sourceRefs.every((source) => /20(2[2-6])/.test(source)), question.id);
  }
});

test("original-paper viewer includes every endterm and retake plus 2026", () => {
  const data = load([
    "archive/page-overlay-backup/page-data.js",
    "archive/page-overlay-backup/page-data-2026.js",
  ]);
  const ids = new Set(data.PAGE_QUIZ_DATA.map((exam) => exam.id));
  for (const id of [
    "2022-endterm", "2023-endterm", "2024-endterm", "2025-endterm", "2026-endterm",
    "2022-retake", "2023-retake", "2024-retake", "2025-retake",
  ]) assert.ok(ids.has(id), id);
  const exam2026 = data.PAGE_QUIZ_DATA.find((exam) => exam.id === "2026-endterm");
  assert.equal(exam2026.sections[0].optionCount, 97);
  assert.equal(exam2026.sections[0].answerCount, 23);
});
