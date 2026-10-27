import { describe, expect, it } from 'vitest';
import { pipelineProgress, snapshotFor, type PipelineEntry } from '../src/pipeline.js';
import type { Row } from '../src/types.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy } from './support/runtime.js';

/** Pipeline rows for weeks 1 to 3, as readRows('pipeline') returns them. */
const history: Row[] = [
  ['Clinic A', 1, 1],
  ['School B', 1, 2],
  ['Clinic A', 2, 2],
  ['School B', 2, 2],
  ['Library C', 2, 3],
  ['Clinic A', 3, 2],
  ['school b', 3, 2],
  ['Library C', 3, 5],
].map(([organisation, week, stage], i) => ({ _row: i + 2, organisation, week, stage }));

const entry = (organisation: string, stage: number): PipelineEntry => ({ organisation, stage });

describe('pipeline progress', () => {
  it('counts moves against the latest earlier snapshot, ignoring case', () => {
    const progress = pipelineProgress(
      [entry('CLINIC A', 3), entry('School B', 2), entry('Library C', 0), entry('Depot D', 1)],
      history,
      4,
      'Organisation',
    );
    expect(progress.moved).toBe(1); // Clinic A 2 → 3; Library C dropping to 0 is not a move
    expect(progress.added).toBe(1); // Depot D
    expect(progress.furthest).toBe(3);
  });

  it('finds organisations at the same stage for three reports in a row', () => {
    const pipeline = [entry('Clinic A', 2), entry('School B', 2), entry('Library C', 5)];
    expect(pipelineProgress(pipeline, history, 4, 'Organisation').stuck).toEqual([
      entry('Clinic A', 2),
      entry('School B', 2),
    ]);
    // Only the Organisation track looks for stuck organisations, and it needs two earlier weeks.
    expect(pipelineProgress(pipeline, history, 4, 'Direct').stuck).toEqual([]);
    expect(pipelineProgress(pipeline, history, 2, 'Organisation').stuck).toEqual([]);
    // At week 3, weeks 1 and 2 are the two earlier snapshots: School B was at 2 in both.
    expect(pipelineProgress(pipeline, history, 3, 'Organisation').stuck).toEqual([
      entry('School B', 2),
    ]);
  });

  it('treats everything as added when there is no earlier snapshot', () => {
    expect(pipelineProgress([entry('A', 1), entry('B', 4)], [], 1, 'Organisation')).toEqual({
      moved: 0,
      added: 2,
      furthest: 4,
      stuck: [],
    });
  });

  it('reads a week of snapshots by lowercased name, like the legacy snapshotFor_', () => {
    const legacy = loadLegacy(new FakeGoogle());
    for (const week of [1, 2, 3, 4]) {
      expect(snapshotFor(history, week)).toEqual(json(legacy.call('snapshotFor_', history, week)));
    }
    expect(snapshotFor(history, 3)).toEqual({ 'clinic a': 2, 'school b': 2, 'library c': 5 });
  });
});
