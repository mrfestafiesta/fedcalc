/**
 * federal-constants-2025.js
 *
 * 2025 U.S. federal *ordinary income* tax brackets by filing status.
 * Data-only module intended to be imported by your main tax planner UI.
 *
 * Filing Status Legend
 * - single - Single filer
 * - mfj - Married Filing Jointly
 * - mfs - Married Filing Separately
 * - hoh - Head of Household
 * 
 * Notes:
 *  - The last bracket uses upTo: Infinity.
 *  - Rates are expressed as decimals (e.g., 0.22 for 22%).
 */

export const FEDERAL_ORDINARY_INCOME_BRACKETS_2025 = {
  single: [
    { upTo: 11925, rate: 0.10 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23850, rate: 0.10 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17000, rate: 0.10 },
    { upTo: 64850, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250500, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfs: [
    { upTo: 11925, rate: 0.10 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 375800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

/**
 * Convenience accessor (optional usage).
 * @param {"single"|"mfj"|"mfs"|"hoh"} status
 */
export function getFederalOrdinaryBrackets2025(status) {
  const brackets = FEDERAL_ORDINARY_INCOME_BRACKETS_2025[status];
  if (!brackets) {
    throw new Error(`Unknown filing status: ${status}`);
  }
  return brackets;
}

export default FEDERAL_ORDINARY_INCOME_BRACKETS_2025;
