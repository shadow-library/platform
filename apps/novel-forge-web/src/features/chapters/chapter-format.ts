export function formatChapterNumber(chapter: number): string {
  return String(chapter).padStart(2, '0');
}

export function activateOnKey(activate: () => void): (event: React.KeyboardEvent<HTMLElement>) => void {
  return event => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    activate();
  };
}
