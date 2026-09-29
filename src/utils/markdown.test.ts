import { describe, expect, it } from 'vitest';
import { escapeTableCell } from './markdown.js';

describe('escapeTableCell', () => {
  it('escapes pipes so they do not start a new column', () => {
    expect(escapeTableCell('Unifi ap | Amazon: AP')).toBe('Unifi ap \\| Amazon: AP');
  });

  it('collapses line breaks so they do not end the row', () => {
    expect(escapeTableCell('line one\r\n  line two\nthree')).toBe('line one line two three');
  });

  it('leaves ordinary text and empty strings unchanged', () => {
    expect(escapeTableCell('Coffee Shop')).toBe('Coffee Shop');
    expect(escapeTableCell('')).toBe('');
  });
});
