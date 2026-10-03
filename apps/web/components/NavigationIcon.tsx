const paths: Record<string, string[]> = {
  Lessons: ['M12 3 2 8l10 5 10-5-10-5Z', 'M6 10.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5'],
  'Learning Materials': ['M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Z', 'M13 3v6h6', 'M8.5 13h7', 'M8.5 17h4.5'],
  Library: ['M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2V4Z', 'M7 20h12', 'M11 2v8l2.5-1.8L16 10V2'],
  Collections: ['M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z', 'M3 12.5 12 17l9-4.5', 'M3 17 12 21.5 21 17'],
  panel: ['M3.5 5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13Z', 'M9.5 3.5v17'],
};

export function NavigationIcon({ name }: { name: string }) {
  const shape = paths[name];
  if (!shape) return null;

  return <svg aria-hidden="true" className="nav-icon" fill="none" focusable="false" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="20">
    {shape.map((definition) => <path d={definition} key={definition} />)}
  </svg>;
}
