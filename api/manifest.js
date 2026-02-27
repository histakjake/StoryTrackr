export const config = {
  runtime: 'nodejs',
};

export default async function handler() {
  return new Response(
    JSON.stringify({
      name: 'StoryTrackr Dashboard',
      short_name: 'StoryTrackr',
      start_url: '/',
      display: 'standalone',
      background_color: '#0b1020',
      theme_color: '#0b1020',
      icons: [],
    }),
    {
      headers: {
        'content-type': 'application/manifest+json; charset=utf-8',
        'cache-control': 'public, max-age=300, must-revalidate',
      },
    },
  );
}
