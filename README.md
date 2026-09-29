# GRNVS MCQ Practice

A static study site built from the available GRNVS solution papers.

## Study surfaces

- **Original papers:** exact interactive MCQ pages from the 2022–2026 endterms and 2022–2025 retakes. Official solution marks are covered until answers are checked or revealed.
- **Topic practice:** focused questions covering only concepts and operations that occur in those papers.
- **Review mistakes:** questions answered incorrectly or revealed during study.
- **Timed exam:** 18 shuffled questions, 30 minutes, delayed feedback, and partial-credit scoring for multiple-answer questions.

Progress is stored only in the browser's local storage.

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`.

## Validation

```bash
npm test
```

The tests reject duplicate question IDs, invalid answer indices, paper-derived questions without explanations or sources, and missing authoritative exam sets.
