const paths: Record<string, string> = {
  '⌂': 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  '▦': 'M3 4h7v7H3z M14 4h7v7h-7z M3 15h7v6H3z M14 15h7v6h-7z',
  '▱': 'M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  '⌁': 'm13 2-9 12h7l-1 8 10-13h-7Z',
  '✎': 'm15 4 5 5 M4 16 16 4a2 2 0 0 1 4 4L8 20l-5 1Z',
  '✦': 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  '↗': 'M4 20V10 M10 20V4 M16 20v-7 M22 20V7',
  'more': 'M4 6h16 M4 12h16 M4 18h16',
}
export function Icon({ name }: { name: string }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths['✦']} /></svg>
}
