const ink = "#17211d";
const muted = "#637169";
const accent = "#0f7c77";
const soft = "#d6ded6";
const orange = "#c88712";

const bitPatterns = {
  nrz: "00110101",
  manchester: "00110101",
  mlt3: "10110100",
  "4b5b": "010011010111010",
};

function setup(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.font = "13px Arial, Helvetica, sans-serif";
  return { ctx, width, height };
}

function grid(ctx, width, height, labels = ["+1", "0", "-1"]) {
  const top = 34;
  const bottom = height - 34;
  ctx.strokeStyle = soft;
  ctx.lineWidth = 1;
  labels.forEach((label, index) => {
    const y = top + (index / (labels.length - 1)) * (bottom - top);
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(label, 10, y + 4);
  });
}

function drawBits(ctx, bits, x0, x1, y) {
  const step = (x1 - x0) / bits.length;
  ctx.fillStyle = muted;
  [...bits].forEach((bit, index) => {
    ctx.fillText(bit, x0 + step * index + step / 2 - 4, y);
    ctx.strokeStyle = "rgba(99, 113, 105, 0.22)";
    ctx.beginPath();
    ctx.moveTo(x0 + step * index, 28);
    ctx.lineTo(x0 + step * index, y - 16);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(x1, 28);
  ctx.lineTo(x1, y - 16);
  ctx.stroke();
}

function drawStep(ctx, points, color = accent) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function waveform(canvas, kind) {
  const { ctx, width, height } = setup(canvas);
  const bits = bitPatterns[kind];
  const x0 = 52;
  const x1 = width - 24;
  const step = (x1 - x0) / bits.length;
  const yHigh = 56;
  const yMid = 118;
  const yLow = 180;
  grid(ctx, width, height);
  drawBits(ctx, bits, x0, x1, height - 12);

  if (kind === "nrz") {
    const points = [];
    [...bits].forEach((bit, index) => {
      const y = bit === "1" ? yHigh : yLow;
      const start = x0 + index * step;
      const end = start + step;
      if (index === 0) points.push([start, y]);
      else points.push([start, points[points.length - 1][1]], [start, y]);
      points.push([end, y]);
    });
    drawStep(ctx, points);
    label(ctx, "0->1 steigt, 1->0 fällt, gleiche Bits bleiben konstant", x0, 20);
  }

  if (kind === "manchester") {
    const points = [];
    [...bits].forEach((bit, index) => {
      const start = x0 + index * step;
      const mid = start + step / 2;
      const end = start + step;
      const first = bit === "0" ? yHigh : yLow;
      const second = bit === "0" ? yLow : yHigh;
      if (index === 0) points.push([start, first]);
      else points.push([start, points[points.length - 1][1]], [start, first]);
      points.push([mid, first], [mid, second], [end, second]);
    });
    drawStep(ctx, points);
    label(ctx, "Jedes Bit: Mittel-Flanke; Bitgrenze je nach Nachbarbit", x0, 20);
  }

  if (kind === "mlt3") {
    const levels = [yMid, yHigh, yMid, yLow];
    let levelIndex = 0;
    const points = [[x0, levels[levelIndex]]];
    [...bits].forEach((bit, index) => {
      const start = x0 + index * step;
      const end = start + step;
      if (bit === "1") {
        points.push([start, levels[levelIndex]]);
        levelIndex = (levelIndex + 1) % levels.length;
        points.push([start, levels[levelIndex]]);
      }
      points.push([end, levels[levelIndex]]);
    });
    drawStep(ctx, points);
    label(ctx, "1: Pegelwechsel, 0: Pegel halten", x0, 20);
  }

  if (kind === "4b5b") {
    const points = [];
    [...bits].forEach((bit, index) => {
      const y = bit === "1" ? yHigh : yLow;
      const start = x0 + index * step;
      const end = start + step;
      if (index === 0) points.push([start, y]);
      else points.push([start, points[points.length - 1][1]], [start, y]);
      points.push([end, y]);
    });
    drawStep(ctx, points, orange);
    label(ctx, "Beispiel-Codebits nach 4B5B: mehr Übergänge, weniger lange Nullfolgen", x0, 20);
  }
}

function label(ctx, text, x, y) {
  ctx.fillStyle = ink;
  ctx.font = "13px Arial, Helvetica, sans-serif";
  ctx.fillText(text, x, y);
}

function axes(ctx, width, height) {
  const cx = width / 2;
  const cy = height / 2 + 8;
  ctx.strokeStyle = soft;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(44, cy);
  ctx.lineTo(width - 28, cy);
  ctx.moveTo(cx, 28);
  ctx.lineTo(cx, height - 30);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.fillText("I", width - 38, cy - 8);
  ctx.fillText("Q", cx + 8, 38);
  return { cx, cy };
}

function dot(ctx, x, y, text, color = accent) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.fillText(text, x + 10, y - 9);
}

function constellation(canvas, kind) {
  const { ctx, width, height } = setup(canvas);
  const { cx, cy } = axes(ctx, width, height);
  label(ctx, kind.toUpperCase(), 18, 22);

  if (kind === "ask") {
    dot(ctx, cx - 60, cy, "0: kleine Amplitude");
    dot(ctx, cx + 105, cy, "1: große Amplitude", orange);
    ctx.strokeStyle = "rgba(15, 124, 119, 0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.arc(cx, cy, 105, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, "Nur Abstand vom Ursprung ändert sich", 18, height - 16);
  }

  if (kind === "psk") {
    const radius = 82;
    [[0, "0"], [Math.PI, "1"], [Math.PI / 2, "90°"], [Math.PI * 1.5, "270°"]].forEach(([angle, text], index) => {
      dot(ctx, cx + Math.cos(angle) * radius, cy - Math.sin(angle) * radius, text, index < 2 ? accent : orange);
    });
    ctx.strokeStyle = "rgba(99, 113, 105, 0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, "Amplitude konstant, Phase ändert sich", 18, height - 16);
  }

  if (kind === "qam") {
    const vals = [-90, -30, 30, 90];
    vals.forEach((dx) => vals.forEach((dy) => dot(ctx, cx + dx, cy + dy, "", Math.abs(dx) === Math.abs(dy) && Math.abs(dx) === 90 ? orange : accent)));
    label(ctx, "16-QAM: I und Q variieren; Amplitude und Phase ändern sich", 18, height - 16);
  }
}

function drawAll() {
  document.querySelectorAll("canvas[data-diagram]").forEach((canvas) => {
    const kind = canvas.dataset.diagram;
    if (["nrz", "manchester", "mlt3", "4b5b"].includes(kind)) waveform(canvas, kind);
    else constellation(canvas, kind);
  });
}

window.addEventListener("resize", drawAll);
drawAll();
