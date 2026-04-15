/**
 * Check if parentheses in an s-expression string are balanced.
 * Quoted strings ("...") are skipped so parens inside them are ignored.
 */
export const isBalancedSexpr = (s: string): boolean => {
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') i++;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth < 0) return false;
    }
    i++;
  }
  return depth === 0;
};

export const handleAutoClose = (e: KeyboardEvent) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (e.key === "(") {
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const value = target.value;

    target.value = value.substring(0, start) + "()" + value.substring(end);
    target.selectionStart = target.selectionEnd = start + 1;
    e.preventDefault();

    // Trigger input event manually to update state in Solid
    const inputEvent = new Event("input", { bubbles: true });
    target.dispatchEvent(inputEvent);
  }
};
