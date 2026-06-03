import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.mjs';

it('writes header + rows in column order', () => {
  expect(toCsv([{ a: 1, b: 'x' }], ['a', 'b'])).toBe('a,b\n1,x\n');
});
it('quotes values containing comma, quote or newline', () => {
  expect(toCsv([{ a: 'a,b', b: 'he said "hi"' }], ['a', 'b']))
    .toBe('a,b\n"a,b","he said ""hi"""\n');
});
it('renders null/undefined as empty', () => {
  expect(toCsv([{ a: null, b: undefined }], ['a', 'b'])).toBe('a,b\n,\n');
});
