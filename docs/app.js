const dupontForm = document.querySelector("#dupont-form");
const dupontResults = document.querySelector("#dupont-results");
const dupontValidation = document.querySelector("#dupont-validation");
const dupontReview = document.querySelector("#dupont-review");
const dupontReviewStatus = document.querySelector("#dupont-review-status");
const dupontReports = [
  {
    key: "profitLoss",
    inputId: "profit-loss-file",
    nameId: "profit-loss-name",
    label: "Profit and Loss",
  },
  {
    key: "beginningBalance",
    inputId: "beginning-balance-file",
    nameId: "beginning-balance-name",
    label: "Beginning Balance Sheet",
  },
  {
    key: "endingBalance",
    inputId: "ending-balance-file",
    nameId: "ending-balance-name",
    label: "Ending Balance Sheet",
  },
];
const dupontValues = [
  {
    key: "netIncome",
    inputId: "dupont-net-income",
    sourceId: "dupont-net-income-source",
    label: "Net income",
    reportKey: "profitLoss",
    rowLabels: ["net income", "net profit"],
  },
  {
    key: "revenue",
    inputId: "dupont-revenue",
    sourceId: "dupont-revenue-source",
    label: "Total income / revenue",
    reportKey: "profitLoss",
    rowLabels: ["total income", "total revenue", "total for income", "total for revenue"],
  },
  {
    key: "beginningAssets",
    inputId: "dupont-beginning-assets",
    sourceId: "dupont-beginning-assets-source",
    label: "Beginning total assets",
    reportKey: "beginningBalance",
    rowLabels: ["total assets", "total for assets"],
  },
  {
    key: "beginningEquity",
    inputId: "dupont-beginning-equity",
    sourceId: "dupont-beginning-equity-source",
    label: "Beginning total equity",
    reportKey: "beginningBalance",
    rowLabels: ["total equity", "total for equity", "total stockholders equity", "total shareholders equity"],
  },
  {
    key: "endingAssets",
    inputId: "dupont-ending-assets",
    sourceId: "dupont-ending-assets-source",
    label: "Ending total assets",
    reportKey: "endingBalance",
    rowLabels: ["total assets", "total for assets"],
  },
  {
    key: "endingEquity",
    inputId: "dupont-ending-equity",
    sourceId: "dupont-ending-equity-source",
    label: "Ending total equity",
    reportKey: "endingBalance",
    rowLabels: ["total equity", "total for equity", "total stockholders equity", "total shareholders equity"],
  },
];
const reportStates = new Map();

const preciseCurrency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function updateDupontReviewStatus() {
  const selectedReports = dupontReports.filter(({ inputId }) => document.querySelector(`#${inputId}`).files[0]);
  dupontReview.hidden = selectedReports.length === 0;
  const completedReports = selectedReports.filter(({ key }) => reportStates.has(key)).length;
  if (selectedReports.length === 0) {
    dupontReviewStatus.textContent = "Choose reports to detect totals.";
    dupontReviewStatus.classList.remove("error");
  } else if (completedReports < selectedReports.length) {
    dupontReviewStatus.textContent = "Reading selected reports…";
    dupontReviewStatus.classList.remove("error");
  } else if (selectedReports.length < dupontReports.length) {
    dupontReviewStatus.textContent = `Detected ${completedReports} of 3 reports.`;
    dupontReviewStatus.classList.remove("error");
  } else {
    const failedReports = [...reportStates.values()].filter((state) => state.error);
    const missingValues = dupontValues.some(({ inputId }) => !document.querySelector(`#${inputId}`).value.trim());
    dupontReviewStatus.textContent = failedReports.length || missingValues
      ? "Some totals need manual entry."
      : "Reports scanned. Verify every total.";
    dupontReviewStatus.classList.toggle("error", failedReports.length > 0 || missingValues);
  }
}

for (const report of dupontReports) {
  const input = document.querySelector(`#${report.inputId}`);
  input.addEventListener("change", async (event) => {
    const file = event.currentTarget.files[0];
    dupontResults.hidden = true;
    dupontValidation.hidden = true;
    dupontReview.hidden = true;
    reportStates.delete(report.key);

    for (const value of dupontValues.filter((entry) => entry.reportKey === report.key)) {
      document.querySelector(`#${value.inputId}`).value = "";
      document.querySelector(`#${value.sourceId}`).textContent = file
        ? "Reading report…"
        : "Choose the report to detect this total.";
    }

    document.querySelector(`#${report.nameId}`).textContent = file?.name || "Choose a CSV file";
    updateDupontReviewStatus();
    if (!file) return;

    try {
      const rows = await readQuickBooksReport(file, report.label);
      if (input.files[0] !== file) return;
      reportStates.set(report.key, {});

      for (const value of dupontValues.filter((entry) => entry.reportKey === report.key)) {
        const match = findReportTotal(rows, value.rowLabels);
        document.querySelector(`#${value.inputId}`).value = match ? String(match.value) : "";
        document.querySelector(`#${value.sourceId}`).textContent = match
          ? `${match.source}. Review or edit this value.`
          : `No matching total found. Enter ${value.label.toLowerCase()} from the report.`;
      }
    } catch (error) {
      if (input.files[0] !== file) return;
      reportStates.set(report.key, { error: error instanceof Error ? error.message : "Could not read this report." });
      for (const value of dupontValues.filter((entry) => entry.reportKey === report.key)) {
        document.querySelector(`#${value.sourceId}`).textContent =
          "Could not detect this total. Enter it manually from the report.";
      }
    }

    updateDupontReviewStatus();
  });
}

for (const input of [
  document.querySelector("#period-start"),
  document.querySelector("#period-end"),
]) {
  input.addEventListener("input", () => {
    dupontResults.hidden = true;
  });
}

for (const { inputId } of dupontValues) {
  document.querySelector(`#${inputId}`).addEventListener("input", () => {
    dupontResults.hidden = true;
    dupontValidation.hidden = true;
    updateDupontReviewStatus();
  });
}

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(source);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (quoted) throw new Error("A CSV file has an unclosed quoted field. Re-export it from QuickBooks and try again.");
  return rows;
}

function detectCsvDelimiter(source) {
  const candidates = [",", "\t", ";"];
  const counts = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  const sample = source.slice(0, 12000);

  for (let index = 0; index < sample.length; index += 1) {
    const character = sample[index];
    if (character === '"') {
      if (quoted && sample[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, counts.get(character) + 1);
    }
  }

  return candidates.reduce((best, candidate) =>
    counts.get(candidate) > counts.get(best) ? candidate : best, ",");
}

function normalizeReportLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseReportAmount(value) {
  const trimmed = value.trim();
  if (!trimmed || /^[-–—]$/.test(trimmed)) return null;
  const isParenthetical = /^\(.*\)$/.test(trimmed);
  let numericText = trimmed.replace(/[−–]/g, "-").replace(/[^\d.,+-]/g, "");
  const lastComma = numericText.lastIndexOf(",");
  const lastPeriod = numericText.lastIndexOf(".");

  if (lastComma >= 0 && lastPeriod >= 0) {
    if (lastComma > lastPeriod) {
      const decimalIndex = numericText.lastIndexOf(",");
      numericText = `${numericText.slice(0, decimalIndex).replace(/[,.]/g, "")}.${numericText.slice(decimalIndex + 1)}`;
    } else {
      numericText = numericText.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const groups = numericText.split(",");
    const isThousandsGrouping = groups.length > 1 &&
      groups[groups.length - 1].length === 3 &&
      groups.slice(1, -1).every((group) => group.length === 2 || group.length === 3);
    if (isThousandsGrouping) {
      numericText = groups.join("");
    } else {
      const decimalIndex = numericText.lastIndexOf(",");
      numericText = `${numericText.slice(0, decimalIndex).replace(/,/g, "")}.${numericText.slice(decimalIndex + 1)}`;
    }
  }

  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(numericText)) return null;
  const amount = Number(numericText);
  if (!Number.isFinite(amount)) return null;
  return isParenthetical ? -Math.abs(amount) : amount;
}

function findReportTotal(rows, labels) {
  const priority = new Map(labels.map((label, index) => [normalizeReportLabel(label), index]));
  let bestMatch = null;

  rows.forEach((row, rowIndex) => {
    for (let labelIndex = 0; labelIndex < row.length; labelIndex += 1) {
      const labelPriority = priority.get(normalizeReportLabel(row[labelIndex] || ""));
      if (labelPriority === undefined) continue;

      let amount = null;
      let amountColumn = -1;
      for (let columnIndex = labelIndex + 1; columnIndex < row.length; columnIndex += 1) {
        const candidate = parseReportAmount(row[columnIndex]);
        if (candidate !== null) {
          amount = candidate;
          amountColumn = columnIndex;
        }
      }
      if (amount === null) continue;

      const match = {
        value: amount,
        label: row[labelIndex].trim(),
        rowIndex,
        amountColumn,
        labelPriority,
      };
      if (
        !bestMatch ||
        match.labelPriority < bestMatch.labelPriority ||
        (match.labelPriority === bestMatch.labelPriority && match.rowIndex > bestMatch.rowIndex)
      ) {
        bestMatch = match;
      }
    }
  });

  if (!bestMatch) return null;
  return {
    value: bestMatch.value,
    source: `Matched "${bestMatch.label}" at row ${bestMatch.rowIndex + 1}, amount column ${bestMatch.amountColumn + 1} (last numeric value)`,
  };
}

async function readQuickBooksReport(file, reportName) {
  if (!file) throw new Error(`Choose the ${reportName} CSV file.`);
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error(`${reportName} must be a CSV file exported from QuickBooks.`);
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`${reportName} is larger than 10 MB. Export a smaller report and try again.`);
  }
  return parseCsv(await file.text());
}

function showDupontError(message) {
  dupontValidation.textContent = message;
  dupontValidation.hidden = false;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function renderDupontResults(result, startDate, endDate) {
  const periodLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  document.querySelector("#dupont-period-label").textContent =
    `${periodLabel.format(new Date(`${startDate}T00:00:00`))} – ${periodLabel.format(new Date(`${endDate}T00:00:00`))}`;
  document.querySelector("#dupont-roe").textContent = formatPercent(result.roe);
  document.querySelector("#dupont-margin").textContent = formatPercent(result.netProfitMargin);
  document.querySelector("#dupont-turnover").textContent = `${result.assetTurnover.toFixed(2)}×`;
  document.querySelector("#dupont-multiplier").textContent = `${result.equityMultiplier.toFixed(2)}×`;
  document.querySelector("#equation-margin").textContent = formatPercent(result.netProfitMargin);
  document.querySelector("#equation-turnover").textContent = `${result.assetTurnover.toFixed(2)}×`;
  document.querySelector("#equation-multiplier").textContent = `${result.equityMultiplier.toFixed(2)}×`;
  document.querySelector("#equation-roe").textContent = formatPercent(result.roe);
  document.querySelector("#summary-net-income").textContent = preciseCurrency.format(result.netIncome);
  document.querySelector("#summary-revenue").textContent = preciseCurrency.format(result.revenue);
  document.querySelector("#summary-assets").textContent = preciseCurrency.format(result.averageAssets);
  document.querySelector("#summary-equity").textContent = preciseCurrency.format(result.averageEquity);
  dupontResults.hidden = false;
  document.querySelector("#dupont-results-title").focus();
  updateNavigation();
}

dupontForm.addEventListener("submit", (event) => {
  event.preventDefault();
  dupontValidation.hidden = true;
  dupontResults.hidden = true;

  const startDate = document.querySelector("#period-start").value;
  const endDate = document.querySelector("#period-end").value;
  if (!startDate || !endDate) {
    showDupontError("Enter the start and end dates for the Profit and Loss period.");
    return;
  }
  if (startDate > endDate) {
    showDupontError("The Profit and Loss start date must be on or before its end date.");
    return;
  }

  for (const report of dupontReports) {
    if (!document.querySelector(`#${report.inputId}`).files[0]) {
      showDupontError(`Choose the ${report.label} CSV file.`);
      return;
    }
  }

  const values = {};
  for (const entry of dupontValues) {
    const value = document.querySelector(`#${entry.inputId}`).valueAsNumber;
    if (!Number.isFinite(value)) {
      showDupontError(`Enter a valid ${entry.label.toLowerCase()} in the review section.`);
      document.querySelector(`#${entry.inputId}`).focus();
      return;
    }
    values[entry.key] = value;
  }

  const averageAssets = (values.beginningAssets + values.endingAssets) / 2;
  const averageEquity = (values.beginningEquity + values.endingEquity) / 2;
  if (values.revenue <= 0) {
    showDupontError("Total income or revenue must be greater than zero to calculate DuPont ratios.");
    return;
  }
  if (averageAssets <= 0) {
    showDupontError("Average total assets must be greater than zero to calculate asset turnover.");
    return;
  }
  if (averageEquity <= 0) {
    showDupontError("Average total equity must be greater than zero for a meaningful equity multiplier.");
    return;
  }

  const netProfitMargin = values.netIncome / values.revenue * 100;
  const assetTurnover = values.revenue / averageAssets;
  const equityMultiplier = averageAssets / averageEquity;
  renderDupontResults({
    roe: values.netIncome / averageEquity * 100,
    netProfitMargin,
    assetTurnover,
    equityMultiplier,
    netIncome: values.netIncome,
    revenue: values.revenue,
    averageAssets,
    averageEquity,
  }, startDate, endDate);
});

const swotForm = document.querySelector("#swot-form");
const swotResults = document.querySelector("#swot-results");
const swotValidation = document.querySelector("#swot-validation");
const swotSubmit = swotForm.querySelector('button[type="submit"]');

function renderSwotList(id, points) {
  const list = document.querySelector(`#${id}`);
  list.replaceChildren(...points.map((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    return item;
  }));
}

swotForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const idea = document.querySelector("#business-idea").value.trim();
  const target = document.querySelector("#target-customer").value.trim();
  const advantage = document.querySelector("#idea-advantage").value.trim();
  const challenge = document.querySelector("#idea-challenge").value.trim();

  if (!idea) {
    swotValidation.textContent = "Describe your business idea to build a SWOT starting point.";
    swotValidation.hidden = false;
    document.querySelector("#business-idea").focus();
    return;
  }

  swotValidation.hidden = true;
  document.querySelector("#swot-results-intro").textContent = `Your idea: ${idea}`;

  const strengths = [
    advantage
      ? `Potential differentiator to test: ${advantage}. Look for evidence that customers value it.`
      : "A clearly described concept can be tested with a small pilot before committing to a full launch.",
    target
      ? `You have identified ${target} as a potential first customer segment, giving early research a useful focus.`
      : "A focused first customer segment can make early customer discovery and positioning more effective.",
  ];

  const weaknesses = [
    challenge
      ? `An obstacle to address: ${challenge}. Estimate its impact and identify what you can test or change.`
      : "The idea still needs evidence on willingness to pay, delivery costs, and repeat demand.",
    target
      ? `No customer evidence was included yet for ${target}; validate the need and willingness to pay before scaling.`
      : "A target customer is not specified yet, which makes it harder to estimate demand or choose effective channels.",
  ];

  const opportunities = [
    target
      ? `Interview ${target} about unmet needs and the workarounds they use today.`
      : "Choose a narrow early-adopter segment and interview them about unmet needs and current workarounds.",
    "Run a small pilot or landing-page test to gauge demand before scaling your investment.",
  ];

  const threats = [
    "Existing or emerging alternatives may offer a faster, cheaper, or more familiar solution; map the substitutes customers already use.",
    "Changes in customer preferences, input costs, or regulation could weaken demand or margins; identify the external factors that matter in your market.",
  ];

  renderSwotList("swot-strengths", strengths);
  renderSwotList("swot-weaknesses", weaknesses);
  renderSwotList("swot-opportunities", opportunities);
  renderSwotList("swot-threats", threats);
  swotResults.hidden = false;
  swotSubmit.innerHTML = 'Refresh my SWOT <span aria-hidden="true">↗</span>';
  document.querySelector("#swot-results-title").focus();
  updateNavigation();
});

const segmentRows = [...document.querySelectorAll(".segment-row")];
const segmentValidation = document.querySelector("#segment-validation");

function getSegmentValues(row) {
  return {
    letter: row.dataset.segment,
    name: row.querySelector(".segment-name").value.trim(),
    need: row.querySelector(".segment-need").value.trim(),
    size: row.querySelector(".segment-size").valueAsNumber,
    willingness: Number(row.querySelector(".segment-willingness").value),
    ltv: row.querySelector(".segment-ltv").valueAsNumber,
    cac: row.querySelector(".segment-cac").valueAsNumber,
    fit: Number(row.querySelector(".segment-fit").value),
  };
}

function formatMillions(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return new Intl.NumberFormat().format(value);
}

function updateSegmentation() {
  const segments = segmentRows.map(getSegmentValues);
  const missing = segments.find((segment) =>
    !segment.name ||
    !Number.isFinite(segment.size) ||
    segment.size < 0 ||
    !Number.isFinite(segment.ltv) ||
    segment.ltv < 0 ||
    !Number.isFinite(segment.cac) ||
    segment.cac < 0
  );

  if (missing) {
    segmentValidation.textContent = "Enter a name, estimated size, lifetime value, and acquisition cost for each segment.";
    segmentValidation.hidden = false;
    for (const row of segmentRows) {
      row.querySelector(".segment-score").textContent = "—";
    }
    document.querySelector("#recommendation-name").textContent = "Complete the segments";
    document.querySelector("#recommendation-copy").textContent = "Add the missing inputs to compare your target groups.";
    document.querySelector("#recommendation-score").textContent = "—";
    document.querySelector("#recommendation-letter").textContent = "—";
    document.querySelector("#segment-reach").textContent = "—";
    document.querySelector("#segment-unit-economics").textContent = "—";
    document.querySelector("#segment-willingness-result").textContent = "—";
    document.querySelector("#segment-fit-result").textContent = "—";
    document.querySelector("#positioning-copy").textContent = "A positioning statement will appear after all segment inputs are complete.";
    return;
  }

  segmentValidation.hidden = true;
  const maxSize = Math.max(...segments.map((segment) => segment.size), 1);
  const scored = segments.map((segment) => {
    const sizeScore = segment.size / maxSize * 25;
    const willingnessScore = segment.willingness / 5 * 25;
    const economicsRatio = segment.cac > 0 ? segment.ltv / segment.cac : segment.ltv > 0 ? 5 : 0;
    const economicsScore = Math.min(economicsRatio / 5, 1) * 25;
    const fitScore = segment.fit / 5 * 25;
    return {
      ...segment,
      economicsRatio,
      score: Math.round(sizeScore + willingnessScore + economicsScore + fitScore),
    };
  });

  scored.forEach((segment) => {
    const row = segmentRows.find((candidate) => candidate.dataset.segment === segment.letter);
    row.querySelector(".segment-score").textContent = segment.score;
  });

  const recommended = scored.sort((a, b) => b.score - a.score)[0];
  const letterIndex = Number(recommended.letter) - 1;
  const recommendationLetter = String.fromCharCode(65 + letterIndex);
  document.querySelector("#recommendation-letter").textContent = recommendationLetter;
  document.querySelector("#recommendation-name").textContent = recommended.name;
  document.querySelector("#recommendation-score").textContent = recommended.score;
  document.querySelector("#recommendation-copy").textContent =
    `This segment scores strongest overall, with ${recommended.willingness}/5 willingness to pay and ${recommended.fit}/5 strategic fit.`;
  document.querySelector("#segment-reach").textContent = formatMillions(recommended.size);
  document.querySelector("#segment-unit-economics").textContent =
    `${recommended.economicsRatio.toFixed(1)}×`;
  document.querySelector("#segment-willingness-result").textContent =
    `${recommended.willingness} / 5`;
  document.querySelector("#segment-fit-result").textContent =
    `${recommended.fit} / 5`;
  document.querySelector("#positioning-title").textContent =
    `Position to ${recommended.name.toLowerCase()}`;
  document.querySelector("#positioning-copy").textContent =
    `For ${recommended.name.toLowerCase()} who need ${recommended.need.toLowerCase()}, we offer a solution that addresses this need more effectively than alternatives.`;
  updateNavigation();
}

for (const input of document.querySelectorAll(".segment-row input, .segment-row select")) {
  input.addEventListener("input", updateSegmentation);
  input.addEventListener("change", updateSegmentation);
}

document.querySelector("#segment-reset").addEventListener("click", () => {
  const defaults = [
    ["Busy professionals", "Save time on meal planning", 12000, "4", 600, 180, "3"],
    ["Health-conscious families", "Healthy dinners without effort", 18000, "3", 720, 240, "4"],
    ["Budget-conscious students", "Affordable convenient meals", 26000, "2", 300, 90, "2"],
  ];
  segmentRows.forEach((row, index) => {
    const [name, need, size, willingness, ltv, cac, fit] = defaults[index];
    row.querySelector(".segment-name").value = name;
    row.querySelector(".segment-need").value = need;
    row.querySelector(".segment-size").value = String(size);
    row.querySelector(".segment-willingness").value = willingness;
    row.querySelector(".segment-ltv").value = String(ltv);
    row.querySelector(".segment-cac").value = String(cac);
    row.querySelector(".segment-fit").value = fit;
  });
  updateSegmentation();
});

const fields = {
  fixedCosts: document.querySelector("#fixed-costs"),
  sellingPrice: document.querySelector("#selling-price"),
  variableCost: document.querySelector("#variable-cost"),
  plannedSales: document.querySelector("#planned-sales"),
  targetProfit: document.querySelector("#target-profit"),
};

const outputs = {
  breakEvenUnits: document.querySelector("#break-even-units"),
  breakEvenRevenue: document.querySelector("#break-even-revenue"),
  contributionMargin: document.querySelector("#contribution-margin"),
  marginPercent: document.querySelector("#margin-percent"),
  plannedProfit: document.querySelector("#planned-profit"),
  targetUnits: document.querySelector("#target-units"),
  targetFoot: document.querySelector(".target-metric .metric-foot"),
  safetyMargin: document.querySelector("#safety-margin"),
  takeawayProfit: document.querySelector("#takeaway-profit"),
  takeawayTitle: document.querySelector("#takeaway-title"),
  takeawayCopy: document.querySelector("#takeaway-copy"),
  statusLine: document.querySelector("#status-line"),
  validation: document.querySelector("#validation-message"),
  track: document.querySelector("#volume-track"),
  trackFill: document.querySelector("#track-fill"),
  trackMarker: document.querySelector("#track-marker"),
  trackCurrent: document.querySelector("#track-current"),
  trackMax: document.querySelector("#track-max"),
};

const defaults = {
  fixedCosts: 24000,
  sellingPrice: 80,
  variableCost: 32,
  plannedSales: 700,
  targetProfit: 12000,
};

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function readNonNegative(input, label) {
  const value = input.valueAsNumber;
  if (!Number.isFinite(value) || value < 0) {
    return { error: `${label} must be a number greater than or equal to zero.` };
  }
  return { value };
}

function showValidation(message) {
  outputs.validation.textContent = message;
  outputs.validation.hidden = false;
  outputs.track.setAttribute("aria-label", message);
  outputs.statusLine.hidden = true;
}

function clearValidation() {
  outputs.validation.hidden = true;
  outputs.statusLine.hidden = false;
}

function update() {
  const entries = [
    ["fixedCosts", "Fixed costs"],
    ["sellingPrice", "Selling price"],
    ["variableCost", "Variable cost"],
    ["plannedSales", "Planned sales volume"],
    ["targetProfit", "Target monthly profit"],
  ];
  const values = {};

  for (const [key, label] of entries) {
    const result = readNonNegative(fields[key], label);
    if (result.error) {
      showValidation(result.error);
      return;
    }
    values[key] = result.value;
  }

  const contribution = values.sellingPrice - values.variableCost;
  if (contribution <= 0) {
    showValidation("Selling price must be greater than variable cost to reach break-even.");
    return;
  }

  clearValidation();
  const exactBreakEvenUnits = values.fixedCosts / contribution;
  const breakEvenUnits = Math.ceil(exactBreakEvenUnits);
  const breakEvenRevenue = exactBreakEvenUnits * values.sellingPrice;
  const marginPercent = contribution / values.sellingPrice * 100;
  const plannedProfit = contribution * values.plannedSales - values.fixedCosts;
  const targetUnits = Math.ceil((values.fixedCosts + values.targetProfit) / contribution);
  const safetyMargin = values.plannedSales === 0
    ? null
    : (values.plannedSales - exactBreakEvenUnits) / values.plannedSales * 100;

  outputs.breakEvenUnits.textContent = number.format(breakEvenUnits);
  outputs.breakEvenRevenue.textContent = currency.format(breakEvenRevenue);
  outputs.contributionMargin.innerHTML = `${currency.format(contribution)} <small>/ unit</small>`;
  outputs.marginPercent.textContent = `${marginPercent.toFixed(1)}%`;
  outputs.plannedProfit.textContent = currency.format(plannedProfit);
  outputs.plannedProfit.classList.toggle("positive", plannedProfit >= 0);
  outputs.plannedProfit.classList.toggle("negative", plannedProfit < 0);
  outputs.targetUnits.innerHTML = `${number.format(targetUnits)} <small>units</small>`;
  outputs.targetFoot.textContent = `To earn ${currency.format(values.targetProfit)} / month`;
  outputs.safetyMargin.textContent = safetyMargin === null ? "—" : `${safetyMargin.toFixed(1)}%`;
  outputs.takeawayProfit.textContent = currency.format(plannedProfit);

  const scaleMax = Math.max(breakEvenUnits, values.plannedSales, targetUnits, 1) * 1.25;
  const breakEvenPosition = exactBreakEvenUnits / scaleMax * 100;
  const plannedPosition = values.plannedSales / scaleMax * 100;
  outputs.trackMarker.style.left = `${Math.max(0, Math.min(100, breakEvenPosition))}%`;
  outputs.trackCurrent.style.left = `${Math.max(0, Math.min(100, plannedPosition))}%`;
  outputs.trackFill.style.width = `${Math.max(0, Math.min(100, plannedPosition))}%`;
  outputs.trackMax.textContent = `${number.format(Math.ceil(scaleMax))} units`;
  outputs.track.setAttribute(
    "aria-label",
    `Planned sales are ${values.plannedSales >= exactBreakEvenUnits ? "above" : "below"} the break-even point of ${number.format(breakEvenUnits)} units.`,
  );

  const unitsFromBreakEven = Math.abs(values.plannedSales - exactBreakEvenUnits);
  const wholeUnits = number.format(Math.ceil(unitsFromBreakEven));
  if (plannedProfit >= 0) {
    outputs.statusLine.innerHTML = `<span class="status-icon" aria-hidden="true">↗</span><span>Your plan is <strong>${wholeUnits} units above</strong> break-even.</span>`;
    outputs.takeawayTitle.textContent = "Room to grow.";
    outputs.takeawayCopy.textContent = `Your planned volume clears break-even. Each additional unit adds ${currency.format(contribution)} toward profit.`;
  } else {
    outputs.statusLine.innerHTML = `<span class="status-icon" aria-hidden="true">↘</span><span>Your plan is <strong>${wholeUnits} units below</strong> break-even.</span>`;
    outputs.takeawayTitle.textContent = "A gap to close.";
    outputs.takeawayCopy.textContent = `At this sales volume, you are below break-even. Consider ways to increase contribution or reduce fixed costs.`;
  }
}

for (const input of Object.values(fields)) {
  input.addEventListener("input", update);
}

document.querySelector("#reset-button").addEventListener("click", () => {
  for (const [key, value] of Object.entries(defaults)) {
    fields[key].value = String(value);
  }
  update();
  fields.fixedCosts.focus();
});

document.querySelector("#share-button").addEventListener("click", async () => {
  const button = document.querySelector("#share-button");
  const originalLabel = button.innerHTML;
  const shareText = "I'm exploring the MBA Fieldnotes break-even analysis tool.";

  if (navigator.share) {
    try {
      await navigator.share({ title: "MBA Fieldnotes", text: shareText, url: window.location.href });
    } catch (error) {
      if (error.name !== "AbortError") {
        button.textContent = "Couldn't open share options";
        window.setTimeout(() => { button.innerHTML = originalLabel; }, 2200);
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${shareText} ${window.location.href}`);
    button.textContent = "Link copied";
    window.setTimeout(() => { button.innerHTML = originalLabel; }, 1800);
  } catch {
    button.textContent = "Copy not available";
    window.setTimeout(() => { button.innerHTML = originalLabel; }, 2200);
  }
});

update();

const navigationSections = ["tools-hub", "swot", "segmentation", "dupont", "tool"];
const navigationLinks = [...document.querySelectorAll("[data-nav-target]")];
const currentLocation = document.querySelector("#current-location");
const navigationLabels = {
  "tools-hub": "All tools",
  swot: "Business planning",
  segmentation: "Marketing",
  dupont: "Finance",
  tool: "Finance",
};

function updateNavigation() {
  const activationLine = Math.min(220, window.innerHeight * 0.3);
  let currentSection = navigationSections[0];

  for (const sectionId of navigationSections) {
    const section = document.getElementById(sectionId);
    if (section && section.getBoundingClientRect().top <= activationLine) {
      currentSection = sectionId;
    }
  }

  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    currentSection = "tool";
  }

  setActiveNavigation(currentSection);
}

function setActiveNavigation(currentSection) {
  for (const link of navigationLinks) {
    const isCurrent = link.dataset.navTarget === currentSection;
    link.classList.toggle("active", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  currentLocation.textContent = navigationLabels[currentSection];
}

for (const link of navigationLinks) {
  link.addEventListener("click", () => {
    setActiveNavigation(link.dataset.navTarget);
  });
}

const navigationObserver = new IntersectionObserver(updateNavigation, {
  rootMargin: "-90px 0px -65% 0px",
  threshold: 0,
});
for (const sectionId of navigationSections) {
  navigationObserver.observe(document.getElementById(sectionId));
}

let navigationFrame = 0;
window.addEventListener("scroll", () => {
  if (navigationFrame) return;
  navigationFrame = window.requestAnimationFrame(() => {
    navigationFrame = 0;
    updateNavigation();
  });
}, { passive: true });

window.addEventListener("resize", updateNavigation);
window.addEventListener("hashchange", updateNavigation);
updateNavigation();
updateSegmentation();
