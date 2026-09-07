import Link from 'next/link';
import type { prRows } from '../db/queries/dashboard';
import { yesNo, duration } from './metrics';
export function PrTable({rows}:{rows:Awaited<ReturnType<typeof prRows>>}){
 return <div className="scroll"><table><thead><tr>{['PR','Status','First pass','Attempts','Clean green','Harness mutation','Time to green'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(({pr,metrics:m})=><tr key={pr.id}><td><Link href={`/prs/${pr.id}`}>#{pr.githubPrNumber} {pr.title}</Link></td><td>{pr.mergedAt?'Merged':pr.state}</td><td>{yesNo(m.firstPassGreen)}</td><td>{m.attemptsToGreen??'—'} <small>({m.ciAttemptCount} total)</small></td><td>{yesNo(m.cleanGreen)}</td><td>{yesNo(m.harnessChangedAfterFailure)}</td><td>{duration(m.timeToFirstGreenSeconds)}</td></tr>)}</tbody></table></div>;
}
