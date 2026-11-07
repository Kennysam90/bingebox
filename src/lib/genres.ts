export const GENRES = [
  { slug: 'action', name: 'Action', line: 'Feel every second.', detail: 'High stakes, big escapes and stories that never slow down.', tag: 'Turn up the intensity' },
  { slug: 'comedy', name: 'Comedy', line: 'Good stories. Great laughs.', detail: 'From quick wit to beautifully ridiculous, find your lighter side.', tag: 'Lighten the mood' },
  { slug: 'horror', name: 'Horror', line: 'A little fear looks good on you.', detail: 'Dark corners, unexpected visitors and stories best watched with the lights on.', tag: 'After dark' },
  { slug: 'thriller', name: 'Thriller', line: 'Trust no one. Watch everything.', detail: 'Secrets, suspense and the kind of twists you never see coming.', tag: 'Stay on the edge' },
  { slug: 'science-fiction', name: 'Sci-Fi', line: 'Beyond the world you know.', detail: 'Distant worlds, impossible ideas and futures waiting to be discovered.', tag: 'Imagine what’s next' },
  { slug: 'romance', name: 'Romance', line: 'For the moments that matter.', detail: 'First sparks, second chances and love stories that stay with you.', tag: 'Feel something' },
  { slug: 'drama', name: 'Drama', line: 'Stories that stay with you.', detail: 'Complex lives, powerful performances and deeply human stories.', tag: 'Get a little closer' },
  { slug: 'crime', name: 'Crime', line: 'Every secret has a story.', detail: 'Detectives, dangerous alliances and the stories behind the crime.', tag: 'Follow the evidence' },
  { slug: 'adventure', name: 'Adventure', line: 'The journey starts here.', detail: 'Discover new worlds, extraordinary journeys and a little danger.', tag: 'Go somewhere extraordinary' },
  { slug: 'animation', name: 'Animation', line: 'Imagination without limits.', detail: 'Animated films, unforgettable characters and series worth getting lost in.', tag: 'Dream a little bigger' },
] as const;
export const genreInfo = (slug: string) => GENRES.find((g) => g.slug === slug);
export const HORROR_ARTWORK = '/images/genres/horror-black-phone.jpg';
