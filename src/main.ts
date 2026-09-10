import {
  calculatePlan,
  clonePlan,
  convertPlanUnit,
  makeDefaultPlan,
  type Leg,
  type Plan,
  type PlanResult,
  type UnitSystem,
  type VehicleMode,
} from './model';
import './styles.css';

const STORAGE_KEY = 'routecost-plan-v1';
const SHARE_PREFIX = 'share=';
const BASE_URL = 'https://thisbejim.github.io/routecost/';
const CURRENCY_CODES = ['AUD', 'USD', 'CAD', 'NZD', 'EUR', 'GBP', 'JPY'] as const;

let state: Plan = makeDefaultPlan();
let isExample = true;
let nextLegId = 3;

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('RouteCost app root is missing.');
const app: HTMLDivElement = appRoot;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: unknown, fallback = 0): number {
  return Math.round(numberValue(value, fallback));
}

function validCurrency(value: unknown): string {
  return CURRENCY_CODES.includes(value as (typeof CURRENCY_CODES)[number]) ? String(value) : 'AUD';
}

function safePlan(raw: unknown): Plan {
  const defaults = makeDefaultPlan();
  if (!raw || typeof raw !== 'object') return defaults;
  const candidate = raw as Partial<Plan>;
  const rawLegs = Array.isArray(candidate.legs) ? candidate.legs : defaults.legs;
  const legs: Leg[] = rawLegs
    .map((rawLeg, index) => {
      const leg = rawLeg as Partial<Leg>;
      return {
        id: typeof leg.id === 'string' && leg.id ? leg.id.slice(0, 40) : `leg-${index + 1}`,
        name: typeof leg.name === 'string' ? leg.name.slice(0, 80) : `Route leg ${index + 1}`,
        distance: Math.max(0, numberValue(leg.distance)),
      };
    })
    .slice(0, 20);
  const gas = candidate.gas && typeof candidate.gas === 'object' ? candidate.gas : defaults.gas;
  const ev = candidate.ev && typeof candidate.ev === 'object' ? candidate.ev : defaults.ev;
  return {
    unitSystem: candidate.unitSystem === 'imperial' ? 'imperial' : 'metric',
    vehicleMode: candidate.vehicleMode === 'ev' ? 'ev' : 'gas',
    compareVehicles: Boolean(candidate.compareVehicles),
    roundTrip: Boolean(candidate.roundTrip),
    legs: legs.length ? legs : defaults.legs,
    gas: {
      efficiency: Math.max(0, numberValue(gas.efficiency, defaults.gas.efficiency)),
      price: Math.max(0, numberValue(gas.price, defaults.gas.price)),
    },
    ev: {
      efficiency: Math.max(0, numberValue(ev.efficiency, defaults.ev.efficiency)),
      price: Math.max(0, numberValue(ev.price, defaults.ev.price)),
    },
    tolls: Math.max(0, numberValue(candidate.tolls)),
    parking: Math.max(0, numberValue(candidate.parking)),
    lodgingNights: Math.max(0, integerValue(candidate.lodgingNights)),
    lodgingPerNight: Math.max(0, numberValue(candidate.lodgingPerNight)),
    foodPerPersonPerDay: Math.max(0, numberValue(candidate.foodPerPersonPerDay)),
    tripDays: Math.max(1, integerValue(candidate.tripDays, defaults.tripDays)),
    activities: Math.max(0, numberValue(candidate.activities)),
    people: Math.max(1, integerValue(candidate.people, defaults.people)),
    bufferPercent: Math.min(50, Math.max(0, numberValue(candidate.bufferPercent, defaults.bufferPercent))),
    currency: validCurrency(candidate.currency),
  };
}

function loadState(): void {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith(SHARE_PREFIX)) {
      const decoded = decodeShare(hash.slice(SHARE_PREFIX.length));
      if (decoded) {
        const sharedPlan = decoded && typeof decoded === 'object' && 'plan' in decoded
          ? (decoded as { plan: unknown }).plan
          : decoded;
        state = safePlan(sharedPlan);
        isExample = false;
        nextLegId = state.legs.reduce((max, leg) => {
          const match = /leg-(\d+)/.exec(leg.id);
          return Math.max(max, match ? Number(match[1]) + 1 : max);
        }, 1);
        return;
      }
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      state = safePlan(JSON.parse(stored));
      isExample = false;
    }
  } catch {
    state = makeDefaultPlan();
    isExample = true;
  }
}

function persistState(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full storage quota should never block the calculator.
  }
}

function formatMoney(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: state.currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${state.currency} ${value.toFixed(2)}`;
  }
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function distanceLabel(): string {
  return state.unitSystem === 'metric' ? 'km' : 'mi';
}

function energyLabel(mode: VehicleMode = state.vehicleMode): string {
  if (mode === 'ev') return 'kWh';
  return state.unitSystem === 'metric' ? 'L' : 'gal';
}

function energyInputLabel(mode: VehicleMode): string {
  if (mode === 'ev') return state.unitSystem === 'metric' ? 'Efficiency (kWh / 100 km)' : 'Efficiency (miles / kWh)';
  return state.unitSystem === 'metric' ? 'Efficiency (L / 100 km)' : 'Fuel economy (miles / gallon)';
}

function priceInputLabel(mode: VehicleMode): string {
  if (mode === 'ev') return 'Charging price (per kWh)';
  return state.unitSystem === 'metric' ? 'Fuel price (per litre)' : 'Fuel price (per gallon)';
}

function input(
  field: string,
  label: string,
  value: string | number,
  options: { type?: string; step?: string; min?: string; max?: string; placeholder?: string; help?: string } = {},
): string {
  const type = options.type ?? 'number';
  const attrs = [
    `data-field="${escapeHtml(field)}"`,
    `type="${type}"`,
    type === 'number' ? `step="${options.step ?? '0.01'}"` : '',
    options.min !== undefined ? `min="${options.min}"` : '',
    options.max !== undefined ? `max="${options.max}"` : '',
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : '',
  ].filter(Boolean).join(' ');
  const stepDecimals = options.step?.includes('.') ? options.step.split('.')[1].length : 0;
  const renderedNumber = Number(value).toFixed(stepDecimals);
  const renderedValue = type === 'number' && Number(value) === 0 && options.placeholder
    ? ''
    : escapeHtml(type === 'number' && Number.isFinite(Number(value)) ? renderedNumber : String(value));
  return `<label class="field"><span>${escapeHtml(label)}</span><input ${attrs} value="${renderedValue}">${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}</label>`;
}

function currencySelect(): string {
  return `<label class="field"><span>Currency (format only)</span><select data-field="currency">${CURRENCY_CODES.map((code) => `<option value="${code}" ${state.currency === code ? 'selected' : ''}>${code}</option>`).join('')}</select><small>No exchange rates or live prices are used.</small></label>`;
}

function renderForm(): void {
  const form = document.querySelector<HTMLFormElement>('#planner-form');
  if (!form) return;
  const alternateMode: VehicleMode = state.vehicleMode === 'gas' ? 'ev' : 'gas';
  const selectedSettings = state.vehicleMode === 'gas' ? state.gas : state.ev;
  const selectedEfficiency = selectedSettings.efficiency;
  const selectedPrice = selectedSettings.price;
  const alternateSettings = alternateMode === 'gas' ? state.gas : state.ev;
  form.innerHTML = `
    <div class="form-heading">
      <div>
        <p class="eyebrow">Step 1 · Add the trip details</p>
        <h2 id="planner-heading">Build your trip budget</h2>
        <p class="muted">Start with the route. Everything else is optional and can be adjusted later.</p>
      </div>
      <button class="text-button" type="button" data-action="example">Use sample values</button>
    </div>

    <fieldset class="control-group">
      <legend>Measurement system</legend>
      <div class="segmented" role="group" aria-label="Measurement system">
        <button type="button" class="segment ${state.unitSystem === 'metric' ? 'active' : ''}" data-action="unit" data-unit="metric" aria-pressed="${state.unitSystem === 'metric'}">Metric <span>km · L</span></button>
        <button type="button" class="segment ${state.unitSystem === 'imperial' ? 'active' : ''}" data-action="unit" data-unit="imperial" aria-pressed="${state.unitSystem === 'imperial'}">US / imperial <span>mi · gal</span></button>
      </div>
    </fieldset>

    <section class="section-block" aria-labelledby="route-title">
      <div class="section-title"><div><p class="eyebrow">The route</p><h3 id="route-title">Where are you driving?</h3></div><span class="step-chip">Required</span></div>
      <div class="check-row">
        <label class="check"><input type="checkbox" data-field="roundTrip" ${state.roundTrip ? 'checked' : ''}><span><strong>Round trip</strong><small>Double distance and energy automatically</small></span></label>
        <label class="check"><input type="checkbox" data-field="compareVehicles" ${state.compareVehicles ? 'checked' : ''}><span><strong>Compare gas and EV</strong><small>Show both totals using the assumptions below</small></span></label>
      </div>
      <div class="legs" id="legs-list">
        ${state.legs.map((leg, index) => `<div class="leg-row">
          <div class="leg-index" aria-hidden="true">${index + 1}</div>
          <label class="field leg-name"><span>Leg name</span><input type="text" data-field="leg:${escapeHtml(leg.id)}.name" value="${escapeHtml(leg.name)}" maxlength="80" placeholder="e.g. Home → coast"></label>
          <label class="field leg-distance"><span>One-way distance (${distanceLabel()})</span><input type="number" data-field="leg:${escapeHtml(leg.id)}.distance" value="${leg.distance ? leg.distance.toFixed(1) : ''}" min="0" step="0.1" inputmode="decimal" placeholder="350"><small>Use a map estimate or odometer distance.</small></label>
          ${state.legs.length > 1 ? `<button class="icon-button" type="button" data-action="remove-leg" data-leg-id="${escapeHtml(leg.id)}" aria-label="Remove ${escapeHtml(leg.name || `leg ${index + 1}`)}">×</button>` : ''}
        </div>`).join('')}
      </div>
      <button class="secondary-button" type="button" data-action="add-leg">+ Add another leg</button>
      <p class="inline-note" id="route-total-note">The route total is ${formatNumber(state.legs.reduce((sum, leg) => sum + Math.max(0, leg.distance), 0))} ${distanceLabel()} one way.</p>
    </section>

    <section class="section-block" aria-labelledby="vehicle-title">
      <div class="section-title"><div><p class="eyebrow">The vehicle</p><h3 id="vehicle-title">How will you power the trip?</h3></div></div>
      <div class="segmented vehicle-switch" role="group" aria-label="Vehicle type">
        <button type="button" class="segment ${state.vehicleMode === 'gas' ? 'active' : ''}" data-action="vehicle" data-vehicle="gas" aria-pressed="${state.vehicleMode === 'gas'}">⛽ Gas / petrol</button>
        <button type="button" class="segment ${state.vehicleMode === 'ev' ? 'active' : ''}" data-action="vehicle" data-vehicle="ev" aria-pressed="${state.vehicleMode === 'ev'}">⚡ Electric vehicle</button>
      </div>
      <div class="field-grid two">
        ${input(state.vehicleMode === 'gas' ? 'gas.efficiency' : 'ev.efficiency', energyInputLabel(state.vehicleMode), selectedEfficiency, { step: '0.1', min: '0', placeholder: state.vehicleMode === 'gas' ? (state.unitSystem === 'metric' ? '7.2' : '28') : (state.unitSystem === 'metric' ? '17.5' : '3.5'), help: state.vehicleMode === 'gas' ? 'Use the combined rating or your real-world average.' : 'Use the car’s typical consumption.' })}
        ${input(state.vehicleMode === 'gas' ? 'gas.price' : 'ev.price', `${priceInputLabel(state.vehicleMode)} · ${state.currency}`, selectedPrice, { step: '0.01', min: '0', placeholder: state.vehicleMode === 'gas' ? '1.90' : '0.32', help: 'Enter the price you expect to pay.' })}
      </div>
      <details class="advanced" ${state.compareVehicles ? 'open' : ''}>
        <summary>Comparison assumptions <span>optional</span></summary>
        <p class="muted">If you compare vehicles, these values power the other card. They are kept separately so you can model a realistic alternative.</p>
        <div class="field-grid two">
          ${input(alternateMode === 'gas' ? 'gas.efficiency' : 'ev.efficiency', energyInputLabel(alternateMode), alternateSettings.efficiency, { step: '0.1', min: '0', placeholder: alternateMode === 'gas' ? (state.unitSystem === 'metric' ? '7.2' : '28') : (state.unitSystem === 'metric' ? '17.5' : '3.5') })}
          ${input(alternateMode === 'gas' ? 'gas.price' : 'ev.price', `${priceInputLabel(alternateMode)} · ${state.currency}`, alternateSettings.price, { step: '0.01', min: '0', placeholder: alternateMode === 'gas' ? '1.90' : '0.32' })}
        </div>
      </details>
    </section>

    <section class="section-block" aria-labelledby="extras-title">
      <div class="section-title"><div><p class="eyebrow">Beyond the fuel pump</p><h3 id="extras-title">Add the costs people forget</h3></div><span class="step-chip optional">Optional</span></div>
      <div class="field-grid two">
        ${input('tripDays', 'Trip days', state.tripDays, { step: '1', min: '1', help: 'Used for food planning.' })}
        ${input('people', 'Travellers sharing costs', state.people, { step: '1', min: '1', help: 'Per-person total uses this number.' })}
        ${input('tolls', `Tolls · ${state.currency}`, state.tolls, { step: '0.01', min: '0', placeholder: '0' })}
        ${input('parking', `Parking · ${state.currency}`, state.parking, { step: '0.01', min: '0', placeholder: '0' })}
        ${input('lodgingNights', 'Lodging nights', state.lodgingNights, { step: '1', min: '0', placeholder: '0' })}
        ${input('lodgingPerNight', `Lodging per night · ${state.currency}`, state.lodgingPerNight, { step: '0.01', min: '0', placeholder: '0' })}
        ${input('foodPerPersonPerDay', `Food per person / day · ${state.currency}`, state.foodPerPersonPerDay, { step: '0.01', min: '0', placeholder: '0' })}
        ${input('activities', `Activities & extras · ${state.currency}`, state.activities, { step: '0.01', min: '0', placeholder: '0' })}
        ${currencySelect()}
      </div>
      <label class="range-field"><span><strong>Budget cushion</strong><output id="buffer-value">${Math.round(state.bufferPercent)}%</output></span><input type="range" data-field="bufferPercent" min="0" max="30" step="1" value="${state.bufferPercent}"><small>A small buffer helps cover price changes and unplanned stops.</small></label>
    </section>

    <div class="privacy-note"><span class="privacy-icon" aria-hidden="true">✓</span><div><strong>Private by default</strong><p>Your numbers stay in this browser. RouteCost has no account, ads, analytics, uploads, or live-price API.</p></div></div>
  `;
}

function resultCard(result: PlanResult, mode: VehicleMode, isCurrent = false): string {
  const title = mode === 'gas' ? 'Gas / petrol' : 'Electric vehicle';
  const subtitle = mode === 'gas'
    ? `${formatNumber(result.energyUsed, 1)} ${energyLabel(mode)} used`
    : `${formatNumber(result.energyUsed, 1)} ${energyLabel(mode)} needed`;
  return `<article class="compare-card ${isCurrent ? 'current' : ''}"><div class="compare-card-title"><span>${mode === 'gas' ? '⛽' : '⚡'} ${title}</span>${isCurrent ? '<span class="current-pill">Selected</span>' : ''}</div><strong>${formatMoney(result.total)}</strong><small>${subtitle} · ${formatMoney(result.perPerson)} per person</small></article>`;
}

function summaryText(result: PlanResult, mode: VehicleMode = state.vehicleMode): string {
  const modeLabel = mode === 'gas' ? 'gas / petrol' : 'electric vehicle';
  const lines = [
    `RouteCost road trip estimate (${modeLabel})`,
    `Trip distance: ${formatNumber(result.distanceTotal)} ${distanceLabel()}${state.roundTrip ? ' round trip' : ''}`,
    `Energy: ${formatNumber(result.energyUsed, 1)} ${energyLabel(mode)} · ${formatMoney(result.energyCost)}`,
    ...result.breakdown.filter((line) => line.key !== 'energy' && line.key !== 'buffer').map((line) => `${line.label}: ${formatMoney(line.amount)}`),
    `Budget cushion: ${formatMoney(result.bufferAmount)}`,
    `Estimated total: ${formatMoney(result.total)}`,
    `Per person (${Math.max(1, state.people)}): ${formatMoney(result.perPerson)}`,
    '',
    'Estimate only: actual prices, traffic and route conditions vary.',
  ];
  return lines.join('\n');
}

function renderResults(): void {
  const resultPanel = document.querySelector<HTMLDivElement>('#results-panel');
  if (!resultPanel) return;
  const result = calculatePlan(state);
  const alternateMode: VehicleMode = state.vehicleMode === 'gas' ? 'ev' : 'gas';
  const alternate = state.compareVehicles ? calculatePlan(state, alternateMode) : null;
  const maxBreakdown = Math.max(result.total, 1);
  const oneWayLabel = `${formatNumber(result.distanceOneWay)} ${distanceLabel()}`;
  const totalLabel = `${formatNumber(result.distanceTotal)} ${distanceLabel()}`;
  const exampleBadge = isExample ? '<span class="sample-pill">Example values · replace me</span>' : '';

  resultPanel.innerHTML = `
    <div class="result-heading"><div><p class="eyebrow">Step 2 · Your answer</p><h2>Trip budget</h2></div>${exampleBadge}</div>
    ${result.errors.length ? `<div class="error-box" role="alert"><strong>A couple of details are needed</strong><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>` : ''}
    <div class="total-card ${result.complete ? '' : 'incomplete'}">
      <div><span class="result-label">Estimated total</span><strong class="total-amount">${formatMoney(result.total)}</strong><span class="result-sub">${formatMoney(result.perPerson)} per traveller · ${totalLabel} total</span></div>
      <div class="total-mark" aria-hidden="true">${state.vehicleMode === 'gas' ? '⛽' : '⚡'}</div>
    </div>
    <div class="stats-grid">
      <div class="stat"><span>One way</span><strong>${oneWayLabel}</strong><small>${state.roundTrip ? 'Doubled below' : 'Route total'}</small></div>
      <div class="stat"><span>${state.vehicleMode === 'gas' ? 'Fuel' : 'Charging'}</span><strong>${formatMoney(result.energyCost)}</strong><small>${formatNumber(result.energyUsed, 1)} ${energyLabel()}</small></div>
      <div class="stat"><span>Extras</span><strong>${formatMoney(result.fixedExtras)}</strong><small>Tolls, stays, food & more</small></div>
      <div class="stat"><span>Cost / ${distanceLabel()}</span><strong>${formatMoney(result.costPerDistance)}</strong><small>Includes cushion</small></div>
    </div>
    <div class="result-section">
      <div class="section-title compact"><div><p class="eyebrow">Where it goes</p><h3>Cost breakdown</h3></div><span class="tiny-note">${state.currency} · estimate</span></div>
      <div class="breakdown-list">${result.breakdown.length ? result.breakdown.map((line) => `<div class="breakdown-row"><div class="breakdown-label"><span>${escapeHtml(line.label)}</span><strong>${formatMoney(line.amount)}</strong></div><div class="bar-track"><span style="width:${Math.min(100, (line.amount / maxBreakdown) * 100).toFixed(1)}%"></span></div></div>`).join('') : '<p class="muted">Add costs to see the breakdown.</p>'}</div>
    </div>
    ${result.legs.length > 1 ? `<div class="result-section"><div class="section-title compact"><div><p class="eyebrow">Route detail</p><h3>Leg-by-leg energy</h3></div></div><div class="leg-results">${result.legs.map((leg) => `<div class="leg-result"><span>${escapeHtml(leg.name)}</span><span>${formatNumber(leg.distance)} ${distanceLabel()}</span><strong>${formatMoney(leg.energyCost)}</strong></div>`).join('')}</div><p class="tiny-note">Round-trip mode shows each leg doubled. Fixed tolls and parking are not doubled.</p></div>` : ''}
    ${alternate ? `<div class="result-section compare-section"><div class="section-title compact"><div><p class="eyebrow">A useful what-if</p><h3>Compare vehicle energy</h3></div></div><div class="compare-grid">${resultCard(result, state.vehicleMode, true)}${resultCard(alternate, alternateMode)} </div><p class="compare-note">${alternate.total === result.total ? 'These assumptions produce the same estimated total.' : `${alternate.total < result.total ? (alternateMode === 'ev' ? 'Charging' : 'Fuel') : (state.vehicleMode === 'ev' ? 'Charging' : 'Fuel')} is about ${formatMoney(Math.abs(result.total - alternate.total))} lower for these assumptions.`}</p></div>` : ''}
    <div class="actions" aria-label="Trip plan actions"><button type="button" class="primary-action" data-action="copy">Copy summary</button><button type="button" class="secondary-button" data-action="download">Download CSV</button><button type="button" class="secondary-button" data-action="share">Copy share link</button><button type="button" class="secondary-button" data-action="print">Print</button></div>
    <p id="action-status" class="action-status" aria-live="polite"></p>
    <details class="method-note"><summary>How RouteCost calculates this</summary><p>Fuel uses distance ÷ MPG or distance × L/100 km. Charging uses distance ÷ miles-per-kWh or distance × kWh/100 km. Tolls, parking, lodging, food and activities are added, then the cushion is applied. Blank optional costs are treated as zero.</p><p>This is a planning estimate, not a live quote. Enter current prices from your route, and confirm local charging, toll and parking costs before you leave.</p></details>
  `;
}

function setStatus(message: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#action-status');
  if (!status) return;
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = '';
  }, 3500);
}

function getByPath(path: string): number | string | boolean {
  if (path === 'roundTrip' || path === 'compareVehicles') return state[path];
  if (path === 'currency') return state.currency;
  if (path === 'bufferPercent' || path === 'tripDays' || path === 'people' || path === 'tolls' || path === 'parking' || path === 'lodgingNights' || path === 'lodgingPerNight' || path === 'foodPerPersonPerDay' || path === 'activities') return state[path];
  if (path === 'gas.efficiency' || path === 'gas.price') return state.gas[path.split('.')[1] as 'efficiency' | 'price'];
  if (path === 'ev.efficiency' || path === 'ev.price') return state.ev[path.split('.')[1] as 'efficiency' | 'price'];
  return '';
}

function updateField(field: string, value: string | number | boolean): void {
  if (field.startsWith('leg:')) {
    const separator = field.indexOf('.');
    const legId = field.slice(4, separator);
    const property = field.slice(separator + 1) as 'name' | 'distance';
    const leg = state.legs.find((candidate) => candidate.id === legId);
    if (!leg) return;
    if (property === 'name') leg.name = String(value).slice(0, 80);
    if (property === 'distance') leg.distance = Math.max(0, numberValue(value));
    return;
  }
  if (field === 'gas.efficiency' || field === 'gas.price') {
    state.gas[field.split('.')[1] as 'efficiency' | 'price'] = Math.max(0, numberValue(value));
    return;
  }
  if (field === 'ev.efficiency' || field === 'ev.price') {
    state.ev[field.split('.')[1] as 'efficiency' | 'price'] = Math.max(0, numberValue(value));
    return;
  }
  if (field === 'currency') {
    state.currency = validCurrency(value);
    return;
  }
  if (field === 'roundTrip' || field === 'compareVehicles') {
    state[field] = Boolean(value);
    return;
  }
  if (field === 'tripDays' || field === 'people' || field === 'lodgingNights') {
    state[field] = Math.max(field === 'tripDays' ? 1 : 0, integerValue(value));
    if (field === 'people') state.people = Math.max(1, state.people);
    return;
  }
  if (field === 'bufferPercent') {
    state.bufferPercent = Math.min(30, Math.max(0, numberValue(value)));
    return;
  }
  if (field === 'tolls' || field === 'parking' || field === 'lodgingPerNight' || field === 'foodPerPersonPerDay' || field === 'activities') {
    state[field] = Math.max(0, numberValue(value));
  }
}

function markChanged(): void {
  isExample = false;
  persistState();
}

function handleFormValue(target: HTMLInputElement | HTMLSelectElement): void {
  const field = target.dataset.field;
  if (!field) return;
  const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
  updateField(field, value);
  markChanged();
  const routeTotal = document.querySelector<HTMLParagraphElement>('#route-total-note');
  if (routeTotal) {
    const oneWayDistance = state.legs.reduce((sum, leg) => sum + Math.max(0, leg.distance), 0);
    routeTotal.textContent = `The route total is ${formatNumber(oneWayDistance)} ${distanceLabel()} one way.`;
  }
  if (field === 'bufferPercent') {
    const output = document.querySelector<HTMLOutputElement>('#buffer-value');
    if (output) output.value = `${Math.round(state.bufferPercent)}%`;
    output && (output.textContent = `${Math.round(state.bufferPercent)}%`);
  }
  renderResults();
}

function csvValue(value: string | number): string {
  const raw = String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

function downloadCsv(): void {
  const result = calculatePlan(state);
  const rows: Array<Array<string | number>> = [
    ['RouteCost road trip plan'],
    ['Vehicle', state.vehicleMode === 'gas' ? 'Gas / petrol' : 'Electric vehicle'],
    ['Currency', state.currency],
    ['Round trip', state.roundTrip ? 'Yes' : 'No'],
    [],
    ['Route leg', `One-way distance (${distanceLabel()})`, `Trip distance (${distanceLabel()})`, `Energy (${energyLabel()})`, 'Energy cost'],
    ...result.legs.map((leg) => [leg.name, leg.distance / (state.roundTrip ? 2 : 1), leg.distance, leg.energyUsed, leg.energyCost]),
    [],
    ['Category', 'Amount'],
    ...result.breakdown.map((line) => [line.label, line.amount]),
    ['Estimated total', result.total],
    ['Per person', result.perPerson],
  ];
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'routecost-trip-plan.csv';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus('CSV downloaded.');
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(value);
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  try {
    if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
  } catch {
    // Fall through to a standards-based URI decoder for older webviews.
  }
  const encoded = Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
  return decodeURIComponent(encoded);
}

function base64Encode(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64_CHARS[first >> 2];
    result += BASE64_CHARS[((first & 3) << 4) | (second === undefined ? 0 : second >> 4)];
    result += second === undefined ? '=' : BASE64_CHARS[((second & 15) << 2) | (third === undefined ? 0 : third >> 6)];
    result += third === undefined ? '=' : BASE64_CHARS[third & 63];
  }
  return result;
}

function base64Decode(value: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    if (character === '=') break;
    const digit = BASE64_CHARS.indexOf(character);
    if (digit < 0) throw new Error('Invalid share link encoding');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
}

function encodeShare(value: unknown): string {
  return base64Encode(utf8Encode(JSON.stringify(value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeShare(value: string): unknown | null {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    return JSON.parse(utf8Decode(base64Decode(padded)));
  } catch {
    return null;
  }
}

function copyText(value: string, successMessage: string, failureMessage: string): void {
  if (!navigator.clipboard) {
    setStatus(failureMessage);
    return;
  }
  void navigator.clipboard.writeText(value).then(() => setStatus(successMessage)).catch(() => setStatus(failureMessage));
}

function sharePlan(): void {
  const encoded = encodeShare({ version: 1, plan: state });
  const url = `${BASE_URL}#${SHARE_PREFIX}${encoded}`;
  window.history.replaceState(null, '', `#${SHARE_PREFIX}${encoded}`);
  copyText(url, 'Share link copied. It contains only the values you chose to share.', 'Share link ready in the address bar.');
}

function handleAction(button: HTMLElement): void {
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'unit') {
    const nextUnit = button.dataset.unit as UnitSystem;
    if (nextUnit && nextUnit !== state.unitSystem) {
      state = convertPlanUnit(state, nextUnit);
      markChanged();
      renderForm();
      renderResults();
    }
    return;
  }
  if (action === 'vehicle') {
    const vehicle = button.dataset.vehicle as VehicleMode;
    if (vehicle === 'gas' || vehicle === 'ev') {
      state.vehicleMode = vehicle;
      markChanged();
      renderForm();
      renderResults();
    }
    return;
  }
  if (action === 'add-leg') {
    state.legs.push({ id: `leg-${nextLegId++}`, name: `Stop ${state.legs.length + 1}`, distance: 0 });
    markChanged();
    renderForm();
    renderResults();
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#legs-list .leg-row:last-child input[type="number"]')?.focus());
    return;
  }
  if (action === 'remove-leg') {
    const legId = button.dataset.legId;
    if (legId && state.legs.length > 1) {
      state.legs = state.legs.filter((leg) => leg.id !== legId);
      markChanged();
      renderForm();
      renderResults();
    }
    return;
  }
  if (action === 'example') {
    state = makeDefaultPlan();
    isExample = true;
    nextLegId = 3;
    persistState();
    window.history.replaceState(null, '', window.location.pathname);
    renderForm();
    renderResults();
    setStatus('Sample trip restored. Replace the values with your own.');
    return;
  }
  if (action === 'copy') {
    copyText(summaryText(calculatePlan(state)), 'Summary copied.', 'Copy was blocked; select the text in the result instead.');
    return;
  }
  if (action === 'download') {
    downloadCsv();
    return;
  }
  if (action === 'share') {
    sharePlan();
    return;
  }
  if (action === 'print') {
    window.print();
  }
}

function renderShell(): void {
  app.innerHTML = `
    <header class="site-header"><a class="brand" href="./" aria-label="RouteCost home"><span class="brand-mark" aria-hidden="true">↗</span><span>RouteCost</span></a><nav aria-label="Page links"><a href="#planner">Planner</a><a href="#how-it-works">How it works</a></nav></header>
    <main>
      <section class="hero" aria-labelledby="page-title"><div class="hero-copy"><p class="eyebrow">A calmer road-trip budget</p><h1 id="page-title">Road trip cost planner</h1><p class="hero-lede">See the real cost of a drive before you leave — fuel or charging, tolls, parking, stays, food and the little extras — in one clear plan.</p><div class="trust-row"><span>✓ Free forever</span><span>✓ No account</span><span>✓ Runs in your browser</span></div></div><div class="hero-callout"><span class="callout-icon" aria-hidden="true">✦</span><div><strong>Private by design</strong><p>Numbers stay on this device. No route tracking, live-price lookups or uploads.</p></div></div></section>
      <section id="planner" class="planner-layout" aria-label="Trip budget planner"><form id="planner-form" class="planner-card" aria-labelledby="planner-heading"></form><aside id="results-panel" class="results-card" aria-live="polite"></aside></section>
      <section id="how-it-works" class="content-section"><div class="content-intro"><p class="eyebrow">Why RouteCost</p><h2>Plan the whole trip, not just the pump stop.</h2><p>Most road-trip calculators stop at distance × fuel price. RouteCost keeps the quick answer, then lets you add the costs that make a trip feel expensive once you are actually on it.</p></div><div class="principles"><article><span class="principle-number">01</span><h3>Start simple</h3><p>Enter one distance, one efficiency figure and a price. You have a useful estimate in seconds.</p></article><article><span class="principle-number">02</span><h3>Make it realistic</h3><p>Add legs, travellers, nights, food, tolls and parking only when they matter to your trip.</p></article><article><span class="principle-number">03</span><h3>Take it with you</h3><p>Copy a summary, download a CSV, print the plan or create a share link when you are ready.</p></article></div></section>
      <section class="faq-section"><details><summary>Does RouteCost use live fuel prices?</summary><p>No. You enter the price you expect to pay, so the estimate is transparent and works offline after the page loads.</p></details><details><summary>Does round-trip mode double my tolls?</summary><p>No. Round-trip mode doubles route distance and energy only. Enter tolls and parking as the total you expect for the trip.</p></details><details><summary>Is my trip data uploaded?</summary><p>No. Calculations and optional local saving happen in this browser. A share link contains the values only when you explicitly copy it.</p></details></section>
    </main>
    <footer class="site-footer"><div><a class="brand" href="./"><span class="brand-mark" aria-hidden="true">↗</span><span>RouteCost</span></a><p>Road trip planning without the spreadsheet sprawl.</p></div><div class="footer-links"><a href="https://github.com/thisbejim/routecost" rel="noreferrer">Open source</a><a href="#planner">Back to planner</a></div></footer>
  `;
  renderForm();
  renderResults();
}

loadState();
renderShell();

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) handleFormValue(target);
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) handleFormValue(target);
});

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest<HTMLElement>('[data-action]');
  if (button) handleAction(button);
});

app.addEventListener('submit', (event) => event.preventDefault());

// Keep the one exported reference useful to lightweight smoke tests without making the app global.
export { calculatePlan, clonePlan, getByPath };
