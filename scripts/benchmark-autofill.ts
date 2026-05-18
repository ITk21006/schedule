// -----------------------------------------------------------------------------
// AUTOFILL BENCHMARK
// -----------------------------------------------------------------------------
// Empirical proof that the greedy auto-fill algorithm runs in milliseconds for
// realistic and even stress-level inputs. Run with:
//
//     npx tsx scripts/benchmark-autofill.ts
//
// To capture results for the thesis appendix:
//
//     npx tsx scripts/benchmark-autofill.ts > docs/autofill-benchmark.txt
//
// The script calls the same `autoFillSchedule` exported from
// `app/lib/autofill.ts` that the production schedule UI calls — no mock, no
// re-implementation. Timing uses Node's high-resolution `performance.now()`,
// which has sub-microsecond precision on Linux.
// -----------------------------------------------------------------------------

import * as os from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  autoFillSchedule,
  type EmployeeForAutofill,
} from '../app/lib/autofill';

type Scenario = {
  label: string;
  employees: number;
  days: number;       // length of the simulated month
  startDate: Date;    // affects which weekdays fall where
  monthNorm: number;  // 0 = no monthly-hours cap
  iterations: number;
};

function makeEmployees(n: number): EmployeeForAutofill[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `emp_${i + 1}`,
    firstName: `Employee${i + 1}`,
    lastName: `Test`,
  }));
}

function makeMonthDates(start: Date, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return out;
}

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

function fmt(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`;
  return `${ms.toFixed(3)}ms`;
}

function runScenario(s: Scenario) {
  const employees = makeEmployees(s.employees);
  const monthDates = makeMonthDates(s.startDate, s.days);

  // JIT warmup — discard the first few runs so V8 can optimize.
  for (let i = 0; i < 50; i++) {
    autoFillSchedule({}, monthDates, employees, s.monthNorm);
  }

  const samples: number[] = [];
  let lastResult = { assigned: 0, uncoveredDays: 0 };

  for (let i = 0; i < s.iterations; i++) {
    const t0 = performance.now();
    const result = autoFillSchedule({}, monthDates, employees, s.monthNorm);
    const t1 = performance.now();
    samples.push(t1 - t0);
    lastResult = { assigned: result.assigned, uncoveredDays: result.uncoveredDays };
  }

  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    label: s.label,
    employees: s.employees,
    days: s.days,
    iterations: s.iterations,
    min: samples[0],
    median: percentile(samples, 50),
    mean: sum / samples.length,
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples[samples.length - 1],
    assigned: lastResult.assigned,
    uncovered: lastResult.uncoveredDays,
  };
}

// -------------------- System info -------------------------------------------
const cpus = os.cpus();
const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'unknown';
console.log('=== AUTOFILL BENCHMARK ===');
console.log(`Date:       ${new Date().toISOString()}`);
console.log(`Node:       ${process.version}`);
console.log(`Platform:   ${process.platform} ${process.arch}`);
console.log(`CPU:        ${cpuModel} (${cpus.length} logical cores)`);
console.log(`Total RAM:  ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GiB`);
console.log('');

// -------------------- Scenarios ---------------------------------------------
// March 2026 has 31 days and starts on a Sunday — a representative full month.
const MARCH_2026 = new Date(2026, 2, 1);
// February 2026 has 28 days — short month sanity check.
const FEB_2026 = new Date(2026, 1, 1);

const scenarios: Scenario[] = [
  { label: 'Small store (typical)',  employees:  3, days: 28, startDate: FEB_2026,   monthNorm: 0,   iterations: 5000 },
  { label: 'Small store + 160h cap', employees:  3, days: 28, startDate: FEB_2026,   monthNorm: 160, iterations: 5000 },
  { label: 'Realistic store',        employees:  5, days: 31, startDate: MARCH_2026, monthNorm: 0,   iterations: 5000 },
  { label: 'Realistic + 176h cap',   employees:  5, days: 31, startDate: MARCH_2026, monthNorm: 176, iterations: 5000 },
  { label: 'Large store',            employees: 10, days: 31, startDate: MARCH_2026, monthNorm: 0,   iterations: 5000 },
  { label: 'Stress (2x large)',      employees: 25, days: 31, startDate: MARCH_2026, monthNorm: 0,   iterations: 2000 },
  { label: 'Stress (5x large)',      employees: 50, days: 31, startDate: MARCH_2026, monthNorm: 0,   iterations: 1000 },
];

const results = scenarios.map(runScenario);

// -------------------- Output table ------------------------------------------
const headers = ['Scenario', 'Emp', 'Days', 'Iter', 'Min', 'Median', 'Mean', 'P95', 'P99', 'Max', 'Assigned'];
const rows = results.map(r => [
  r.label,
  String(r.employees),
  String(r.days),
  String(r.iterations),
  fmt(r.min),
  fmt(r.median),
  fmt(r.mean),
  fmt(r.p95),
  fmt(r.p99),
  fmt(r.max),
  `${r.assigned} (${r.uncovered} uncovered)`,
]);

const widths = headers.map((h, i) =>
  Math.max(h.length, ...rows.map(r => r[i].length))
);
const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);
const renderRow = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join('  ');

console.log(renderRow(headers));
console.log(widths.map(w => '-'.repeat(w)).join('  '));
for (const row of rows) console.log(renderRow(row));

console.log('');
console.log('Notes:');
console.log('  • Timing uses Node `performance.now()` (sub-microsecond resolution).');
console.log('  • First 50 calls per scenario are discarded as JIT warmup.');
console.log('  • "Assigned" is the total number of shifts the algorithm placed;');
console.log('    "uncovered" is the count of open days that could not be fully');
console.log('    staffed (no eligible employee left under the work-streak cap).');
console.log('  • All scenarios run on the exact `autoFillSchedule` exported from');
console.log('    `app/lib/autofill.ts` — no mock, no re-implementation.');
