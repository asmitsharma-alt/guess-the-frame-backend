import { describe, it, expect } from 'vitest';
import FuzzyMatcher from '../src/utils/fuzzyMatch.js';

describe('FuzzyMatcher Algorithm', () => {
  it('normalizes casing, years, and punctuation', () => {
    expect(FuzzyMatcher.normalize('A Space Odyssey (1968)')).toBe('space odyssey');
    expect(FuzzyMatcher.normalize('The Holdovers(2023)')).toBe('holdovers');
    expect(FuzzyMatcher.normalize('Dil Se.. (1998)')).toBe('dil se');
    expect(FuzzyMatcher.normalize('Mad Max 2.jpg')).toBe('mad max 2jpg');
  });

  it('matches exact answers case-insensitively', () => {
    expect(FuzzyMatcher.isMatch('RUSH', 'Rush')).toBe(true);
    expect(FuzzyMatcher.isMatch('rush', 'RUSH')).toBe(true);
    expect(FuzzyMatcher.isMatch('MEMENTO', 'memento')).toBe(true);
  });

  it('ignores leading articles', () => {
    expect(FuzzyMatcher.isMatch('The Batman', 'BATMAN')).toBe(true);
    expect(FuzzyMatcher.isMatch('Batman', 'THE BATMAN')).toBe(true);
    expect(FuzzyMatcher.isMatch('A Wednesday', 'Wednesday')).toBe(true);
  });

  it('tolerates typos within Levenshtein distance 2', () => {
    // 1 typo in Oppenheimer -> Oppenhimer
    expect(FuzzyMatcher.isMatch('Oppenhimer', 'Oppenheimer')).toBe(true);
    // 1 typo in Booksmart -> Booksmrt
    expect(FuzzyMatcher.isMatch('Booksmrt', 'Booksmart')).toBe(true);
    // Disallowed wild length discrepancies
    expect(FuzzyMatcher.isMatch('Rushhhh', 'Rush')).toBe(false);
  });

  it('handles subtitles correctly', () => {
    expect(FuzzyMatcher.isMatch('Bhavesh Joshi', 'Bhavesh Joshi Superhero')).toBe(true);
  });
});
