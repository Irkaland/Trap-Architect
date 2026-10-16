// Authoring helper: `npm run solve` prints the shortest solution of every
// built-in room using the same simulation the game uses.
import { solve } from '../src/core/solver';
import { LEVEL_DEFS, levelOf } from '../src/levels/levels';

for (const def of LEVEL_DEFS) {
  const r = solve(levelOf(def));
  const sol = r.solution ? r.solution.join('') : 'UNSOLVABLE';
  const flag = r.solution && r.solution.length !== def.target ? '  <-- target mismatch' : '';
  console.log(`${def.id} ${def.name.padEnd(16)} ${String(r.solution?.length ?? '-').padStart(3)}  ${sol}${flag}`);
}
