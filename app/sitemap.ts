import { MetadataRoute } from 'next'
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  const staticPages = [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/login`, lastModified: new Date() },
    { url: `${baseUrl}/register`, lastModified: new Date() },
    { url: `${baseUrl}/order`, lastModified: new Date() },
    { url: `${baseUrl}/account`, lastModified: new Date() },
    { url: `${baseUrl}/support`, lastModified: new Date() },
    { url: `${baseUrl}/faq`, lastModified: new Date() },
    { url: `${baseUrl}/terms`, lastModified: new Date() },
    { url: `${baseUrl}/privacy`, lastModified: new Date() },
    { url: `${baseUrl}/refund-policy`, lastModified: new Date() },
    { url: `${baseUrl}/blog`, lastModified: new Date() },
    { url: `${baseUrl}/reseller`, lastModified: new Date() },
  ];

  try {
    const [games, pages] = await Promise.all([
      prisma.game.findMany({
        where: { active: true },
        select: { slug: true, updatedAt: true }
      }),
      prisma.blogPost.findMany({
        where: { published: true },
        select: { slug: true, publishedAt: true, updatedAt: true }
      }),
    ]);

    const gamePages = games.map(game => ({
      url: `${baseUrl}/games/${game.slug}`,
      lastModified: game.updatedAt,
    }));

    const blogPages = pages.map(page => ({
      url: `${baseUrl}/blog/${page.slug}`,
      lastModified: page.publishedAt || page.updatedAt,
    }));

    return [...staticPages, ...gamePages, ...blogPages];
  } catch (error) {
    console.warn('Sitemap: Could not fetch dynamic pages, returning static only');
    return staticPages;
  }
}