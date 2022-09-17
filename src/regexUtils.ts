// Taken & adapted from VSCode source
import { AST as ReAST, RegExpParser, RegExpVisitor } from 'vscode-regexpp';
import * as vscode from 'vscode';

export interface RegExpOptions {
    matchCase?: boolean;
    wholeWord?: boolean;
    multiline?: boolean;
    global?: boolean;
    unicode?: boolean;
}

export interface ProcessedQuery {
    isRegex: boolean,
    pattern: string
}

export function processQuery(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions): ProcessedQuery {
    if (query.isWordMatch) {
        const regexp = createRegExp(query.pattern, !!query.isRegExp, { wholeWord: query.isWordMatch });
        const regexpStr = regexp.source.replace(/\\\//g, '/'); // RegExp.source arbitrarily returns escaped slashes. Search and destroy.
        return {
            isRegex: true,
            pattern: regexpStr
        };
    } else if (query.isRegExp) {
        let fixedRegexpQuery = fixRegexNewline(query.pattern);
        fixedRegexpQuery = fixNewline(fixedRegexpQuery);
        return {
            isRegex: true,
            pattern: fixedRegexpQuery
        };
    } else {
        return {
            isRegex: false,
            pattern: query.pattern
        };
    }
}

/**
 * Escapes regular expression characters in a given string
 */
 export function escapeRegExpCharacters(value: string): string {
    return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}

const isLookBehind = (node: ReAST.Node) => node.type === 'Assertion' && node.kind === 'lookbehind';

export function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
    if (!searchString) {
        throw new Error('Cannot create regex from empty string');
    }
    if (!isRegex) {
        searchString = escapeRegExpCharacters(searchString);
    }
    if (options.wholeWord) {
        if (!/\B/.test(searchString.charAt(0))) {
            searchString = '\\b' + searchString;
        }
        if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
            searchString = searchString + '\\b';
        }
    }
    let modifiers = '';
    if (options.global) {
        modifiers += 'g';
    }
    if (!options.matchCase) {
        modifiers += 'i';
    }
    if (options.multiline) {
        modifiers += 'm';
    }
    if (options.unicode) {
        modifiers += 'u';
    }

    return new RegExp(searchString, modifiers);
}

export function fixRegexNewline(pattern: string): string {
    // we parse the pattern anew each tiem
    let re: ReAST.Pattern;
    try {
        re = new RegExpParser().parsePattern(pattern);
    } catch {
        return pattern;
    }

    let output = '';
    let lastEmittedIndex = 0;
    const replace = (start: number, end: number, text: string) => {
        output += pattern.slice(lastEmittedIndex, start) + text;
        lastEmittedIndex = end;
    };

    const context: ReAST.Node[] = [];
    const visitor = new RegExpVisitor({
        onCharacterEnter(char) {
            if (char.raw !== '\\n') {
                return;
            }

            const parent = context[0];
            if (!parent) {
                // simple char, \n -> \r?\n
                replace(char.start, char.end, '\\r?\\n');
            } else if (context.some(isLookBehind)) {
                // no-op in a lookbehind, see #100569
            } else if (parent.type === 'CharacterClass') {
                if (parent.negate) {
                    // negative bracket expr, [^a-z\n] -> (?![a-z]|\r?\n)
                    const otherContent = pattern.slice(parent.start + 2, char.start) + pattern.slice(char.end, parent.end - 1);
                    if (parent.parent?.type === 'Quantifier') {
                        // If quantified, we can't use a negative lookahead in a quantifier.
                        // But `.` already doesn't match new lines, so we can just use that
                        // (with any other negations) instead.
                        replace(parent.start, parent.end, otherContent ? `[^${otherContent}]` : '.');
                    } else {
                        replace(parent.start, parent.end, '(?!\\r?\\n' + (otherContent ? `|[${otherContent}]` : '') + ')');
                    }
                } else {
                    // positive bracket expr, [a-z\n] -> (?:[a-z]|\r?\n)
                    const otherContent = pattern.slice(parent.start + 1, char.start) + pattern.slice(char.end, parent.end - 1);
                    replace(parent.start, parent.end, otherContent === '' ? '\\r?\\n' : `(?:[${otherContent}]|\\r?\\n)`);
                }
            } else if (parent.type === 'Quantifier') {
                replace(char.start, char.end, '(?:\\r?\\n)');
            }
        },
        onQuantifierEnter(node) {
            context.unshift(node);
        },
        onQuantifierLeave() {
            context.shift();
        },
        onCharacterClassRangeEnter(node) {
            context.unshift(node);
        },
        onCharacterClassRangeLeave() {
            context.shift();
        },
        onCharacterClassEnter(node) {
            context.unshift(node);
        },
        onCharacterClassLeave() {
            context.shift();
        },
        onAssertionEnter(node) {
            if (isLookBehind(node)) {
                context.push(node);
            }
        },
        onAssertionLeave(node) {
            if (context[0] === node) {
                context.shift();
            }
        },
    });

    visitor.visit(re);
    output += pattern.slice(lastEmittedIndex);
    return output;
}

export function fixNewline(pattern: string): string {
    return pattern.replace(/\n/g, '\\r?\\n');
}
