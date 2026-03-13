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
