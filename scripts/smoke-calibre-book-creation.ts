import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEmptyCalibreBook, runCalibredb } from "../lib/calibredb";
import { createDatabase } from "../lib/db/factory";

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tome-release-calibre-"));
  let connection: ReturnType<typeof createDatabase> | undefined;
  try {
    const library = path.join(directory, "library");
    process.env.CALIBRE_CONFIG_DIRECTORY = path.join(directory, "config");
    process.env.CALIBRE_DB_PATH = path.join(library, "metadata.db");
    await runCalibredb([
      "add", `--with-library=${library}`, "--empty",
      "--title=Release smoke seed", "--authors=Smoke Author",
    ]);
    const id = await createEmptyCalibreBook({
      title: 'Physical Book "Smoke Test"',
      authors: ["Doe, Jane", "Other Author"],
      isbn: "9780140328721",
      tags: ["Physical", "Wishlist"],
    });
    connection = createDatabase({
      path: process.env.CALIBRE_DB_PATH,
      readonly: true,
      wal: false,
      foreignKeys: false,
    });
    const book = connection.sqlite.prepare("SELECT title, path FROM books WHERE id = ?")
      .get(id) as { title: string; path: string } | undefined;
    assert.equal(book?.title, 'Physical Book "Smoke Test"');
    assert.ok(book);
    const authors = connection.sqlite.prepare(`
      SELECT a.name FROM authors a
      JOIN books_authors_link bal ON bal.author = a.id
      WHERE bal.book = ? ORDER BY bal.id
    `).all(id) as Array<{ name: string }>;
    assert.deepEqual(authors.map(author => author.name), ["Doe, Jane", "Other Author"]);
    const isbn = connection.sqlite.prepare("SELECT val FROM identifiers WHERE book = ? AND type = 'isbn'")
      .get(id) as { val: string } | undefined;
    assert.equal(isbn?.val, "9780140328721");
    const tags = connection.sqlite.prepare(`
      SELECT t.name FROM tags t JOIN books_tags_link btl ON btl.tag = t.id
      WHERE btl.book = ? ORDER BY t.name
    `).all(id) as Array<{ name: string }>;
    assert.deepEqual(tags.map(tag => tag.name), ["Physical", "Wishlist"]);
    const formats = connection.sqlite.prepare("SELECT COUNT(*) AS count FROM data WHERE book = ?")
      .get(id) as { count: number };
    assert.equal(formats.count, 0);
    await access(path.join(library, book.path, "metadata.opf"));
    console.log("Calibre creation smoke test passed: metadata, authors, tags, ISBN, folder and OPF verified; no ebook formats.");
  } finally {
    connection?.sqlite.close();
    await rm(directory, { recursive: true });
  }
}

main().catch(error => {
  console.error("Calibre creation smoke test failed:", error);
  process.exitCode = 1;
});
