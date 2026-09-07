import { calculatePrMetrics } from '../../metrics/calculate-pr-metrics';
import { groupChecksIntoAttempts } from './attempts';
import type { GatePolicy, PullRequestFacts } from './types';
export { groupChecksIntoAttempts } from './attempts';
export function analyzePullRequest(facts: PullRequestFacts, policy: GatePolicy) {
  const attempts = groupChecksIntoAttempts(facts, policy);
  return { attempts, metrics: calculatePrMetrics(facts, policy, attempts) };
}
