import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Plus, Edit3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlogAdminPage() {
  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      tag: true,
      published: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Blog / News</h1>
          <p className="text-royal-muted text-sm">Posts shown on /blog.</p>
        </div>
        <Link href="/admin/blog/new" className="btn-primary"><Plus className="h-4 w-4" /> New post</Link>
      </div>

      {posts.length === 0 ? (
        <div className="card p-10 text-center text-royal-muted text-sm">No posts yet. Create your first one.</div>
      ) : (
        <div className="card divide-y divide-royal-border">
          {posts.map((p: any) => (
            <div key={p.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{p.title}</h3>
                  {p.tag && <span className="text-[10px] px-2 py-0.5 rounded-full bg-royal-primary/10 text-royal-primary">{p.tag}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.published ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                    {p.published ? "PUBLISHED" : "DRAFT"}
                  </span>
                </div>
                <div className="text-xs text-royal-muted mt-1 truncate">/{p.slug} · updated {new Date(p.updatedAt).toLocaleString()}</div>
                {p.excerpt && <p className="text-sm text-royal-muted/80 mt-2 line-clamp-2">{p.excerpt}</p>}
              </div>
              <Link href={`/admin/blog/${p.id}`} className="btn-ghost text-xs px-3 py-1.5">
                <Edit3 className="h-3 w-3" /> Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

