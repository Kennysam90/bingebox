export function parseSearchQuery(query: string, genres: { slug: string; name: string }[]) {
  let rest = ` ${query.toLowerCase()} `;
  let year: number | undefined;
  let decade: number | undefined;
  let genre: { slug: string; name: string } | undefined;
  const dec = rest.match(/\b(1[89]\d0|20\d0)'?s\b/);
  if (dec) { decade = Number(dec[1]); rest = rest.replace(dec[0], ' '); }
  const yr = rest.match(/\b(18[89]\d|19\d\d|20\d\d)\b/);
  if (yr) { year = Number(yr[1]); rest = rest.replace(yr[0], ' '); }
  for (const g of [...genres].sort((a, b) => b.name.length - a.name.length)) {
    const aliases = [g.name.toLowerCase(), g.slug.replace(/-/g, ' '), ...(g.slug === 'science-fiction' ? ['sci-fi', 'scifi', 'sci fi'] : [])];
    const hit = aliases.find((a) => rest.includes(` ${a} `) || rest.includes(` ${a}s `));
    if (hit) {
      genre = g;
      rest = rest.replace(` ${hit}${rest.includes(` ${hit}s `) ? 's' : ''} `, ' ');
      break;
    }
  }
  return { text: rest.trim(), year, decade, genre };
}
