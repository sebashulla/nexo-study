const paths: Record<string, string> = {
  '⌂': 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  '▦': 'M3 4h7v7H3z M14 4h7v7h-7z M3 15h7v6H3z M14 15h7v6h-7z',
  '▱': 'M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  '⌁': 'm13 2-9 12h7l-1 8 10-13h-7Z',
  '✎': 'm15 4 5 5 M4 16 16 4a2 2 0 0 1 4 4L8 20l-5 1Z',
  '✦': 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  '↗': 'M4 20V10 M10 20V4 M16 20v-7 M22 20V7',
  'more': 'M4 6h16 M4 12h16 M4 18h16',
  'collapse': 'm15 5-7 7 7 7 M21 4v16',
  'expand': 'm9 5 7 7-7 7 M3 4v16',
  'close': 'M5 5l14 14 M19 5 5 19',
  'chat': 'M20 11.5a8 8 0 0 1-8 8 8.6 8.6 0 0 1-3.5-.8L4 20l1.3-4.5A8 8 0 1 1 20 11.5Z',
  'paperclip': 'm20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.8-8.8a3.5 3.5 0 0 1 5 5l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.1-8.1',
  'idea': 'M9 18h6 M10 22h4 M8 14a7 7 0 1 1 8 0c-.8.7-1.2 1.3-1.2 2.2H9.2C9.2 15.3 8.8 14.7 8 14Z',
  'bug': 'M8 8 5 5 M16 8l3-3 M8 15l-4 2 M16 15l4 2 M9 20h6 M8 9a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0V9Z M8 12h8',
}
export function Icon({ name }: { name: string }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths['✦']} /></svg>
}
