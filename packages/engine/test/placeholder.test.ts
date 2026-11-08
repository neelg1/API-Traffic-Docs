import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';

// Proves the test runner and imports from src/ are wired up. Replace with
// real tests once the first pipeline stage lands (task 1.9).
describe('engine', () => {
  it('loads its public entry point', () => {
    expect(engine).toBeTypeOf('object');
  });
});
