/** /api/v1/categories — public category tree (cached). */
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { cached } from "../../lib/cache";
import { notFound } from "../../lib/errors";

export const categoriesRouter = Router();

export const loadCategoryTree = () =>
  cached("categories", "tree", 600, async () => {
    const all = await prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return all
      .filter((c) => !c.parentId)
      .map((p) => ({ ...p, children: all.filter((c) => c.parentId === p.id) }));
  });

categoriesRouter.get("/", async (_req, res) => {
  res.json({ categories: await loadCategoryTree() });
});

categoriesRouter.get("/:slug", async (req, res) => {
  const tree = await loadCategoryTree();
  const flat = tree.flatMap((c) => [c, ...c.children]);
  const cat = flat.find((c) => c.slug === req.params.slug);
  if (!cat) throw notFound("Category");
  res.json({ category: cat });
});
