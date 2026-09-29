/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://projectfluence.vercel.app',
  sourceDir: '.next',
  generateRobotsTxt: true, // will generate robots.txt
  sitemapSize: 5000,
  autoLastmod: false,
  exclude: ['/analytics', '/auth/*', '/api/*', '/icon.png'],
  additionalPaths: async (config) => Promise.all(
    ['/vocabstream', '/speakwise', '/vidmatch'].map((route) => config.transform(config, route)),
  ),
};
