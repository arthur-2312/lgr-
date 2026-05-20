const $ = (id) => document.getElementById(id);

const state = {
  numerator: [1],
  denominator: [1, 2, 2, 0],
  currentExample: { numerator: [1], denominator: [1, 2, 2, 0] },
  k: 1,
  kMin: 0,
  kMax: 100,
  zeta: 0.5,
  wn: 3,
  lastMap: null,
};

const els = {
  numInput: $("numInput"),
  denInput: $("denInput"),
  gainSlider: $("gainSlider"),
  gainValue: $("gainValue"),
  kMinInput: $("kMinInput"),
  kMaxInput: $("kMaxInput"),
  numSliders: $("numSliders"),
  denSliders: $("denSliders"),
  numDegreeUp: $("numDegreeUp"),
  numDegreeDown: $("numDegreeDown"),
  denDegreeUp: $("denDegreeUp"),
  denDegreeDown: $("denDegreeDown"),
  rootCanvas: $("rootCanvas"),
  stepCanvas: $("stepCanvas"),
  systemStatus: $("systemStatus"),
  closedPoles: $("closedPoles"),
  openZeros: $("openZeros"),
  characteristicPoly: $("characteristicPoly"),
  closedLoopFormula: $("closedLoopFormula"),
  performanceMetrics: $("performanceMetrics"),
  stepInfo: $("stepInfo"),
  studySteps: $("studySteps"),
  branchCount: $("branchCount"),
  clickReadout: $("clickReadout"),
  resetButton: $("resetButton"),
  showAsymptotes: $("showAsymptotes"),
  showRealAxis: $("showRealAxis"),
  showBreakpoints: $("showBreakpoints"),
  showImagCross: $("showImagCross"),
  showDesignGrid: $("showDesignGrid"),
  showAngles: $("showAngles"),
};

function parseCoefficients(value) {
  const parsed = value
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  return trimLeadingZeros(parsed.length ? parsed : [0]);
}

function trimLeadingZeros(poly) {
  const copy = poly.slice();
  while (copy.length > 1 && Math.abs(copy[0]) < 1e-12) copy.shift();
  return copy;
}

function padLeft(poly, length) {
  return Array(Math.max(0, length - poly.length)).fill(0).concat(poly);
}

function addPolys(a, b) {
  const len = Math.max(a.length, b.length);
  const aa = padLeft(a, len);
  const bb = padLeft(b, len);
  return trimLeadingZeros(aa.map((v, i) => v + bb[i]));
}

function subPolys(a, b) {
  return addPolys(a, scalePoly(b, -1));
}

function scalePoly(poly, scalar) {
  return trimLeadingZeros(poly.map((value) => value * scalar));
}

function multiplyPolys(a, b) {
  const result = Array(a.length + b.length - 1).fill(0);
  a.forEach((av, i) => b.forEach((bv, j) => (result[i + j] += av * bv)));
  return trimLeadingZeros(result);
}

function derivative(poly) {
  const order = poly.length - 1;
  if (order <= 0) return [0];
  return poly.slice(0, -1).map((coef, index) => coef * (order - index));
}

function evalPoly(poly, z) {
  return poly.reduce((acc, coef) => cAdd(cMul(acc, z), c(coef, 0)), c(0, 0));
}

function normalize(poly) {
  const p = trimLeadingZeros(poly);
  return Math.abs(p[0]) < 1e-12 ? p : p.map((value) => value / p[0]);
}

function closedLoopPolynomial(k = state.k) {
  return addPolys(state.denominator, scalePoly(state.numerator, k));
}

function c(re, im = 0) {
  return { re, im };
}

function cAdd(a, b) {
  return c(a.re + b.re, a.im + b.im);
}

function cSub(a, b) {
  return c(a.re - b.re, a.im - b.im);
}

function cMul(a, b) {
  return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function cDiv(a, b) {
  const den = b.re * b.re + b.im * b.im || 1e-18;
  return c((a.re * b.re + a.im * b.im) / den, (a.im * b.re - a.re * b.im) / den);
}

function cAbs(a) {
  return Math.hypot(a.re, a.im);
}

function roots(poly) {
  const p = normalize(poly);
  const degree = p.length - 1;
  if (degree <= 0) return [];
  if (degree === 1) return [c(-p[1] / p[0], 0)];

  const radius = 1 + Math.max(...p.slice(1).map(Math.abs));
  let zs = Array.from({ length: degree }, (_, i) => {
    const angle = (2 * Math.PI * i) / degree + 0.19;
    return c(radius * Math.cos(angle), radius * Math.sin(angle));
  });

  for (let iter = 0; iter < 180; iter++) {
    let maxDelta = 0;
    zs = zs.map((zi, i) => {
      let denom = c(1, 0);
      for (let j = 0; j < zs.length; j++) {
        if (i !== j) denom = cMul(denom, cSub(zi, zs[j]));
      }
      const delta = cDiv(evalPoly(p, zi), denom);
      maxDelta = Math.max(maxDelta, cAbs(delta));
      return cSub(zi, delta);
    });
    if (maxDelta < 1e-10) break;
  }

  return zs
    .map((z) => (Math.abs(z.im) < 1e-7 ? c(z.re, 0) : z))
    .sort((a, b) => a.re - b.re || a.im - b.im);
}

function tidy(value) {
  if (!Number.isFinite(value)) return "n/a";
  return String(Number(value.toFixed(Math.abs(value) >= 100 ? 2 : 4)));
}

function metric(value, suffix = "") {
  return Number.isFinite(value) ? `${tidy(value)}${suffix}` : "n/a";
}

function formatComplex(z) {
  const re = Math.abs(z.re) < 1e-8 ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-8 ? 0 : z.im;
  if (im === 0) return re.toFixed(3);
  if (re === 0) return `${im.toFixed(3)}j`;
  return `${re.toFixed(3)} ${im >= 0 ? "+" : "-"} ${Math.abs(im).toFixed(3)}j`;
}

function formatPolynomial(poly) {
  const order = poly.length - 1;
  return poly
    .map((coef, i) => ({ coef, power: order - i }))
    .filter(({ coef }) => Math.abs(coef) > 1e-9)
    .map(({ coef, power }, index) => {
      const sign = coef < 0 ? "-" : index === 0 ? "" : "+";
      const value = Math.abs(coef);
      const number = value === 1 && power > 0 ? "" : tidy(value);
      const variable = power === 0 ? "" : power === 1 ? "s" : `s^${power}`;
      return `${sign} ${number}${variable}`.trim();
    })
    .join(" ") || "0";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function syncFromInputs() {
  state.numerator = parseCoefficients(els.numInput.value);
  state.denominator = parseCoefficients(els.denInput.value);
  state.kMin = Number(els.kMinInput.value);
  state.kMax = Number(els.kMaxInput.value);
  if (!Number.isFinite(state.kMin)) state.kMin = 0;
  if (!Number.isFinite(state.kMax) || state.kMax <= state.kMin) state.kMax = state.kMin + 1;
  els.gainSlider.min = state.kMin;
  els.gainSlider.max = state.kMax;
  state.k = clamp(Number(els.gainSlider.value), state.kMin, state.kMax);
  els.gainSlider.value = state.k;
}

function syncInputsFromState() {
  els.numInput.value = state.numerator.join(", ");
  els.denInput.value = state.denominator.join(", ");
}

function buildCoefficientSliders() {
  buildSliderGroup(els.numSliders, "num", state.numerator);
  buildSliderGroup(els.denSliders, "den", state.denominator);
}

function buildSliderGroup(container, type, values) {
  container.innerHTML = "";
  values.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "coefficient-row";

    const label = document.createElement("span");
    const degree = values.length - 1 - index;
    label.textContent = degree === 0 ? "cte" : `s^${degree}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-20";
    slider.max = "20";
    slider.step = "0.05";
    slider.value = clamp(value, -20, 20);

    const number = document.createElement("input");
    number.type = "number";
    number.step = "0.05";
    number.value = tidy(value);

    const update = (next) => {
      const target = type === "num" ? state.numerator : state.denominator;
      target[index] = Number(next) || 0;
      if (type === "num") state.numerator = trimLeadingZeros(target);
      else state.denominator = trimLeadingZeros(target);
      syncInputsFromState();
      render(false);
    };

    slider.addEventListener("input", () => {
      number.value = slider.value;
      update(slider.value);
    });
    number.addEventListener("input", () => {
      slider.value = clamp(Number(number.value), -20, 20);
      update(number.value);
    });

    row.append(label, slider, number);
    container.appendChild(row);
  });
}

function changeDegree(type, delta) {
  const target = type === "num" ? state.numerator : state.denominator;
  if (delta > 0) target.unshift(0);
  if (delta < 0 && target.length > 1) target.shift();
  if (type === "num") state.numerator = target;
  else state.denominator = target;
  syncInputsFromState();
  render();
}

function getRootLocusData() {
  const samples = 190;
  const tracks = [];
  const allPoints = [];
  let previous = [];

  for (let i = 0; i <= samples; i++) {
    const ratio = i / samples;
    const k = state.kMin + (state.kMax - state.kMin) * ratio * ratio;
    const current = roots(closedLoopPolynomial(k));
    allPoints.push(...current);

    if (!previous.length) {
      current.forEach((point, index) => (tracks[index] = [{ ...point, k }]));
    } else {
      const remaining = current.slice();
      tracks.forEach((track) => {
        const last = track[track.length - 1];
        let best = 0;
        let bestDist = Infinity;
        remaining.forEach((point, index) => {
          const dist = Math.hypot(point.re - last.re, point.im - last.im);
          if (dist < bestDist) {
            best = index;
            bestDist = dist;
          }
        });
        const [chosen] = remaining.splice(best, 1);
        if (chosen) track.push({ ...chosen, k });
      });
      remaining.forEach((point) => tracks.push([{ ...point, k }]));
    }
    previous = current;
  }
  return { tracks, allPoints };
}

function analyzeRootLocus() {
  const poles = roots(state.denominator);
  const zeros = roots(state.numerator);
  const n = state.denominator.length - 1;
  const m = state.numerator.length - 1;
  const excess = n - m;
  const realPoints = [
    ...poles.filter((p) => Math.abs(p.im) < 1e-6).map((p) => p.re),
    ...zeros.filter((z) => Math.abs(z.im) < 1e-6).map((z) => z.re),
  ];
  const asymptotes = [];
  if (excess > 0) {
    const centroid =
      (poles.reduce((sum, p) => sum + p.re, 0) - zeros.reduce((sum, z) => sum + z.re, 0)) / excess;
    for (let q = 0; q < excess; q++) asymptotes.push({ centroid, angle: ((2 * q + 1) * Math.PI) / excess });
  }
  return {
    poles,
    zeros,
    n,
    m,
    branches: Math.max(n, m),
    excess,
    realAxisSegments: realAxisLocusSegments(realPoints),
    asymptotes,
    breakpoints: findBreakpoints(),
    imaginaryCrossings: findImaginaryCrossings(),
  };
}

function realAxisLocusSegments(points) {
  if (!points.length) return [];
  const sorted = [...new Set(points.map((p) => Number(p.toFixed(8))))].sort((a, b) => a - b);
  const edges = [-Infinity, ...sorted, Infinity];
  const segments = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const left = edges[i];
    const right = edges[i + 1];
    const test = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
    if (points.filter((p) => p > test).length % 2 === 1) segments.push({ left, right });
  }
  return segments;
}

function findBreakpoints() {
  const dPrimeN = multiplyPolys(derivative(state.denominator), state.numerator);
  const dNPrime = multiplyPolys(state.denominator, derivative(state.numerator));
  return roots(subPolys(dPrimeN, dNPrime))
    .filter((point) => Math.abs(point.im) < 1e-5)
    .map((point) => {
      const s = c(point.re, 0);
      return { s: point.re, k: -evalPoly(state.denominator, s).re / (evalPoly(state.numerator, s).re || 1e-18) };
    })
    .filter((item) => item.k >= state.kMin - 1e-8 && item.k <= state.kMax + 1e-8)
    .sort((a, b) => a.s - b.s);
}

function findImaginaryCrossings() {
  const crossings = [];
  let last = roots(closedLoopPolynomial(state.kMin));
  let lastK = state.kMin;
  for (let i = 1; i <= 260; i++) {
    const k = state.kMin + ((state.kMax - state.kMin) * i) / 260;
    const current = roots(closedLoopPolynomial(k));
    current.forEach((root) => {
      const nearest = last.reduce((best, item) => {
        const dist = Math.abs(item.im - root.im) + Math.abs(item.re - root.re);
        return dist < best.dist ? { item, dist } : best;
      }, { item: last[0], dist: Infinity }).item;
      if (nearest && nearest.re * root.re <= 0 && Math.abs(root.im) > 1e-4) {
        const t = Math.abs(nearest.re) / (Math.abs(nearest.re) + Math.abs(root.re) || 1);
        crossings.push({ k: lastK + (k - lastK) * t, w: Math.abs(nearest.im + (root.im - nearest.im) * t) });
      }
    });
    last = current;
    lastK = k;
  }
  return crossings.filter((item, index) => crossings.findIndex((other) => Math.abs(item.k - other.k) < 0.05 && Math.abs(item.w - other.w) < 0.05) === index);
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(240, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function fitBounds(points) {
  const useful = points.filter((p) => Number.isFinite(p.re) && Number.isFinite(p.im));
  if (!useful.length) return { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  let minX = Math.min(...useful.map((p) => p.re));
  let maxX = Math.max(...useful.map((p) => p.re));
  let minY = Math.min(...useful.map((p) => p.im));
  let maxY = Math.max(...useful.map((p) => p.im));
  const xPad = Math.max(1, (maxX - minX) * 0.14);
  const yPad = Math.max(1, (maxY - minY) * 0.2);
  minX -= xPad;
  maxX += xPad;
  minY -= yPad;
  maxY += yPad;
  const span = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX: cx - span / 2, maxX: cx + span / 2, minY: cy - span / 2, maxY: cy + span / 2 };
}

function makeMap(bounds, width, height, pad = 38) {
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offsetX = pad + (innerW - usedW) / 2;
  const offsetY = pad + (innerH - usedH) / 2;
  return {
    toPixel: (point) => ({
      x: offsetX + (point.re - bounds.minX) * scale,
      y: offsetY + usedH - (point.im - bounds.minY) * scale,
    }),
    toPlane: (x, y) =>
      c(
        bounds.minX + (x - offsetX) / scale,
        bounds.minY + (offsetY + usedH - y) / scale,
      ),
    pad,
  };
}

function drawAxes(ctx, map, width, height, bounds) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e7ebe6";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = "#66706d";

  const xStep = niceStep((bounds.maxX - bounds.minX) / 8);
  const origin = map.toPixel(c(0, 0));
  for (let x = Math.ceil(bounds.minX / xStep) * xStep; x <= bounds.maxX; x += xStep) {
    const px = map.toPixel(c(x, 0)).x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    if (Math.abs(x) > 1e-8 && px > 18 && px < width - 24 && origin.y > 16 && origin.y < height - 8) {
      ctx.fillText(tidy(x), px + 4, origin.y - 6);
    }
  }
  const yStep = niceStep((bounds.maxY - bounds.minY) / 8);
  for (let y = Math.ceil(bounds.minY / yStep) * yStep; y <= bounds.maxY; y += yStep) {
    const py = map.toPixel(c(0, y)).y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
    if (Math.abs(y) > 1e-8 && py > 16 && py < height - 8 && origin.x > 10 && origin.x < width - 34) {
      ctx.fillText(tidy(y), origin.x + 7, py - 4);
    }
  }

  ctx.strokeStyle = "#aeb8b2";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();
}

function niceStep(value) {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1e-9))));
  const fraction = value / power;
  if (fraction < 1.5) return power;
  if (fraction < 3.5) return 2 * power;
  if (fraction < 7.5) return 5 * power;
  return 10 * power;
}

function drawRootLocus() {
  const { ctx, width, height } = setupCanvas(els.rootCanvas);
  const data = getRootLocusData();
  const analysis = analyzeRootLocus();
  const selected = roots(closedLoopPolynomial(state.k));
  const bounds = fitBounds([...data.allPoints, ...analysis.poles, ...analysis.zeros, ...selected, c(0, 0)]);
  const map = makeMap(bounds, width, height);
  state.lastMap = { bounds, width, height, pad: map.pad };

  drawAxes(ctx, map, width, height, bounds);
  drawOverlays(ctx, map, bounds, analysis);
  drawTracks(ctx, map, data.tracks);
  analysis.poles.forEach((point) => drawCross(ctx, map.toPixel(point), "#d84f31", 8, 2.5));
  analysis.zeros.forEach((point) => drawCircle(ctx, map.toPixel(point), "#b88310", 7, 2.5, false));
  selected.forEach((point) => drawCircle(ctx, map.toPixel(point), "#0f7a6c", 6, 2, true));
}

function drawOverlays(ctx, map, bounds, analysis) {
  if (els.showDesignGrid.checked) drawDesignGrid(ctx, map, bounds);
  if (els.showRealAxis.checked) drawRealAxisSegments(ctx, map, analysis.realAxisSegments, bounds);
  if (els.showAsymptotes.checked) drawAsymptotes(ctx, map, bounds, analysis.asymptotes);
  if (els.showBreakpoints.checked) analysis.breakpoints.forEach((item) => drawLabeledPoint(ctx, map.toPixel(c(item.s, 0)), "#111827", `K=${tidy(item.k)}`));
  if (els.showImagCross.checked) {
    analysis.imaginaryCrossings.forEach((item) => {
      drawLabeledPoint(ctx, map.toPixel(c(0, item.w)), "#d84f31", `K=${tidy(item.k)}`);
      drawLabeledPoint(ctx, map.toPixel(c(0, -item.w)), "#d84f31", `K=${tidy(item.k)}`);
    });
  }
  if (els.showAngles.checked) drawAngleGuides(ctx, map, analysis.poles, analysis.zeros);
}

function drawTracks(ctx, map, tracks) {
  tracks.forEach((track) => {
    ctx.beginPath();
    track.forEach((point, index) => {
      const p = map.toPixel(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = "#2b6cb0";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    for (let i = 28; i < track.length; i += 58) {
      drawArrowHead(ctx, map.toPixel(track[i - 1]), map.toPixel(track[i]), "#2b6cb0");
    }
  });
}

function drawArrowHead(ctx, from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  if (!Number.isFinite(angle)) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - 8 * Math.cos(angle - 0.5), to.y - 8 * Math.sin(angle - 0.5));
  ctx.lineTo(to.x - 8 * Math.cos(angle + 0.5), to.y - 8 * Math.sin(angle + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDesignGrid(ctx, map, bounds) {
  const zeta = state.zeta;
  const theta = Math.acos(zeta);
  const r = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)) * 1.5;
  ctx.save();
  ctx.strokeStyle = "rgba(15, 122, 108, 0.35)";
  ctx.setLineDash([8, 7]);
  [theta, -theta].forEach((angle) => {
    const p1 = map.toPixel(c(0, 0));
    const p2 = map.toPixel(c(-r * Math.cos(angle), r * Math.sin(angle)));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawRealAxisSegments(ctx, map, segments, bounds) {
  ctx.save();
  ctx.strokeStyle = "#0f7a6c";
  ctx.lineWidth = 5;
  segments.forEach((segment) => {
    const left = Number.isFinite(segment.left) ? segment.left : bounds.minX;
    const right = Number.isFinite(segment.right) ? segment.right : bounds.maxX;
    const p1 = map.toPixel(c(left, 0));
    const p2 = map.toPixel(c(right, 0));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawAsymptotes(ctx, map, bounds, asymptotes) {
  ctx.save();
  ctx.strokeStyle = "rgba(216, 79, 49, 0.62)";
  ctx.setLineDash([9, 7]);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 1.5;
  asymptotes.forEach(({ centroid, angle }) => {
    const p1 = map.toPixel(c(centroid - span * Math.cos(angle), -span * Math.sin(angle)));
    const p2 = map.toPixel(c(centroid + span * Math.cos(angle), span * Math.sin(angle)));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawAngleGuides(ctx, map, poles, zeros) {
  const target = poles.find((p) => Math.abs(p.im) > 1e-5);
  if (!target) return;
  ctx.save();
  ctx.strokeStyle = "rgba(43, 108, 176, 0.38)";
  ctx.setLineDash([5, 5]);
  [...poles, ...zeros].forEach((point) => {
    if (point === target) return;
    const a = map.toPixel(point);
    const b = map.toPixel(target);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawCross(ctx, p, color, size, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y - size);
  ctx.lineTo(p.x + size, p.y + size);
  ctx.moveTo(p.x + size, p.y - size);
  ctx.lineTo(p.x - size, p.y + size);
  ctx.stroke();
}

function drawCircle(ctx, p, color, radius, width, fill) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawLabeledPoint(ctx, p, color, label) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText(label, p.x + 7, p.y - 7);
  ctx.restore();
}

function performanceFromPoles(poles) {
  const dynamic = poles.filter((p) => Math.abs(p.re) + Math.abs(p.im) > 1e-7);
  if (!dynamic.length) return null;
  const dominant = dynamic.reduce((best, p) => (p.re > best.re ? p : best), dynamic[0]);
  const wn = Math.hypot(dominant.re, dominant.im);
  const zeta = wn > 0 ? -dominant.re / wn : 0;
  const wd = Math.abs(dominant.im);
  const mp = zeta > 0 && zeta < 1 ? Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)) * 100 : 0;
  const ts = zeta > 0 && wn > 0 ? 4 / (zeta * wn) : Infinity;
  const tp = wd > 1e-8 ? Math.PI / wd : Infinity;
  return { dominant, wn, zeta, mp, ts, tp };
}

function getStepData() {
  const stepDen = closedLoopPolynomial(state.k).concat([0]);
  const stepNum = scalePoly(state.numerator, state.k);
  const poles = roots(stepDen);
  const der = derivative(stepDen);
  const dynamicPoles = roots(closedLoopPolynomial(state.k));
  const stableReals = dynamicPoles.filter((p) => p.re < -1e-5).map((p) => Math.abs(p.re));
  const slowest = stableReals.length ? Math.min(...stableReals) : 1;
  const tMax = clamp(6 / slowest, 5, 35);
  const data = [];
  for (let i = 0; i <= 280; i++) {
    const t = (tMax * i) / 280;
    let y = c(0, 0);
    poles.forEach((pole) => {
      const residue = cDiv(evalPoly(stepNum, pole), evalPoly(der, pole));
      const exp = c(Math.exp(pole.re * t) * Math.cos(pole.im * t), Math.exp(pole.re * t) * Math.sin(pole.im * t));
      y = cAdd(y, cMul(residue, exp));
    });
    data.push({ t, y: Number.isFinite(y.re) ? y.re : 0 });
  }
  return { data, tMax };
}

function drawStep() {
  const { ctx, width, height } = setupCanvas(els.stepCanvas);
  const { data, tMax } = getStepData();
  const pad = { left: 42, right: 12, top: 16, bottom: 30 };
  const values = data.map((d) => d.y).filter(Number.isFinite);
  let minY = Math.min(0, ...values);
  let maxY = Math.max(1, ...values);
  const yPad = Math.max(0.2, (maxY - minY) * 0.12);
  minY -= yPad;
  maxY += yPad;
  const map = (d) => ({
    x: pad.left + (d.t / tMax) * (width - pad.left - pad.right),
    y: height - pad.bottom - ((d.y - minY) / (maxY - minY)) * (height - pad.top - pad.bottom),
  });
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e7ebe6";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + ((height - pad.top - pad.bottom) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#0f7a6c";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.forEach((d, index) => {
    const p = map(d);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  els.stepInfo.textContent = `0 a ${tidy(tMax)} s`;
}

function estimateKAtPoint(s) {
  const den = evalPoly(state.denominator, s);
  const num = evalPoly(state.numerator, s);
  if (cAbs(num) < 1e-10) return null;
  return -cDiv(den, num).re;
}

function updateMetrics() {
  const closed = roots(closedLoopPolynomial(state.k));
  const zeros = roots(state.numerator);
  const stable = closed.every((root) => root.re < -1e-7);
  const perf = performanceFromPoles(closed);
  els.systemStatus.textContent = stable ? "Estavel" : "Instavel";
  els.systemStatus.classList.toggle("unstable", !stable);
  els.closedPoles.textContent = closed.map(formatComplex).join(" | ") || "-";
  els.openZeros.textContent = zeros.map(formatComplex).join(" | ") || "Sem zeros finitos";
  els.characteristicPoly.textContent = `${formatPolynomial(closedLoopPolynomial(state.k))} = 0`;
  els.closedLoopFormula.textContent = `D(s) + K N(s) = ${formatPolynomial(closedLoopPolynomial(state.k))}`;
  els.gainValue.textContent = tidy(state.k);
  els.performanceMetrics.textContent = perf
    ? `s_d=${formatComplex(perf.dominant)} | zeta=${metric(perf.zeta)} | wn=${metric(perf.wn)} | Mp=${metric(perf.mp, "%")} | ts=${metric(perf.ts, "s")} | tp=${metric(perf.tp, "s")}`
    : "-";
}

function updateSummary() {
  const a = analyzeRootLocus();
  els.branchCount.textContent = `${a.branches} ramos`;
  const realText = a.realAxisSegments.length
    ? a.realAxisSegments.map((s) => `(${formatEdge(s.left)}, ${formatEdge(s.right)})`).join("  ")
    : "nenhum";
  const asymText = a.asymptotes.length
    ? `centroide ${tidy(a.asymptotes[0].centroid)}, angulos ${a.asymptotes.map((x) => `${tidy((x.angle * 180) / Math.PI)} graus`).join(", ")}`
    : "sem assintotas";
  const breakText = a.breakpoints.length ? a.breakpoints.map((b) => `s=${tidy(b.s)}, K=${tidy(b.k)}`).join(" | ") : "nenhum no intervalo";
  const crossText = a.imaginaryCrossings.length ? a.imaginaryCrossings.map((x) => `K=${tidy(x.k)}, w=${tidy(x.w)}`).join(" | ") : "nenhum no intervalo";
  els.studySteps.innerHTML = [
    `Polos de malha aberta: ${a.poles.map(formatComplex).join(" | ") || "-"}.`,
    `Zeros de malha aberta: ${a.zeros.map(formatComplex).join(" | ") || "sem zeros finitos"}.`,
    `Ramos: ${a.branches}; excesso n-m: ${a.excess}.`,
    `Trechos no eixo real: ${realText}.`,
    `Assintotas: ${asymText}.`,
    `Breakaway/break-in: ${breakText}.`,
    `Cruzamento com eixo imaginario: ${crossText}.`,
  ].map((item) => `<li>${item}</li>`).join("");
}

function formatEdge(value) {
  if (value === Infinity) return "+inf";
  if (value === -Infinity) return "-inf";
  return tidy(value);
}

function render(rebuildSliders = true) {
  syncFromInputs();
  if (rebuildSliders) buildCoefficientSliders();
  updateMetrics();
  updateSummary();
  drawRootLocus();
  drawStep();
}

function handleCanvasClick(event) {
  if (!state.lastMap) return;
  const rect = els.rootCanvas.getBoundingClientRect();
  const map = makeMap(state.lastMap.bounds, state.lastMap.width, state.lastMap.height, state.lastMap.pad);
  const s = map.toPlane(event.clientX - rect.left, event.clientY - rect.top);
  const k = estimateKAtPoint(s);
  if (!Number.isFinite(k) || k < 0) {
    els.clickReadout.textContent = `Ponto ${formatComplex(s)} nao pertence ao LGR para K positivo.`;
    return;
  }
  els.gainSlider.value = clamp(k, state.kMin, state.kMax);
  state.k = Number(els.gainSlider.value);
  els.clickReadout.textContent = `Ponto ${formatComplex(s)}: K estimado ${tidy(k)}.`;
  render(false);
}

function bindEvents() {
  els.numInput.addEventListener("input", () => render());
  els.denInput.addEventListener("input", () => render());
  els.gainSlider.addEventListener("input", () => render(false));
  els.kMinInput.addEventListener("input", () => render(false));
  els.kMaxInput.addEventListener("input", () => render(false));
  [els.showAsymptotes, els.showRealAxis, els.showBreakpoints, els.showImagCross, els.showDesignGrid, els.showAngles].forEach((el) =>
    el.addEventListener("change", () => render(false)),
  );
  els.numDegreeUp.addEventListener("click", () => changeDegree("num", 1));
  els.numDegreeDown.addEventListener("click", () => changeDegree("num", -1));
  els.denDegreeUp.addEventListener("click", () => changeDegree("den", 1));
  els.denDegreeDown.addEventListener("click", () => changeDegree("den", -1));
  els.resetButton.addEventListener("click", () => {
    state.numerator = state.currentExample.numerator.slice();
    state.denominator = state.currentExample.denominator.slice();
    syncInputsFromState();
    render();
  });
  document.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.numerator = parseCoefficients(button.dataset.num);
      state.denominator = parseCoefficients(button.dataset.den);
      state.currentExample = { numerator: state.numerator.slice(), denominator: state.denominator.slice() };
      syncInputsFromState();
      render();
    });
  });
  els.rootCanvas.addEventListener("click", handleCanvasClick);
  window.addEventListener("resize", () => render(false));
}

bindEvents();
render();
