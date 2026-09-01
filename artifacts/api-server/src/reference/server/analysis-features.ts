/**
 * Release switches for expensive or deferred analysis branches.
 *
 * Keep disabled branches readable for persisted historical runs.  These flags
 * control new provider work only; they never rewrite existing results.
 */
export const ANALYSIS_FEATURES = Object.freeze({
  moneyNowGeneration: false,
});
