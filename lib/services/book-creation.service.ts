import { BookCreationError, type CalibreBookInput } from "@/lib/calibre-book-input";
import { createEmptyCalibreBook } from "@/lib/calibredb";
import { findCalibreBookByMetadata } from "@/lib/db/calibre";
import { bookRepository } from "@/lib/repositories";
import { syncCalibreLibrary, type SyncResult } from "@/lib/sync-service";
import { calibreWatcher } from "@/lib/calibre-watcher";
import { getLogger } from "@/lib/logger";

interface BookCreationDependencies {
  create: (input: CalibreBookInput) => Promise<number>;
  findDuplicate: (title: string, authors: string[]) => number | undefined;
  sync: () => Promise<SyncResult>;
  findBook: (calibreId: number) => Promise<{ id: number } | undefined>;
  watcher: { suspend: () => void; resume: () => void };
}

const dependencies: BookCreationDependencies = {
  create: createEmptyCalibreBook,
  findDuplicate: findCalibreBookByMetadata,
  sync: () => syncCalibreLibrary(undefined, { detectOrphans: false }),
  findBook: id => bookRepository.findByCalibreId(id),
  watcher: calibreWatcher,
};

export class BookCreationService {
  private creating = false;

  constructor(private readonly deps: BookCreationDependencies = dependencies) {}

  async create(input: CalibreBookInput): Promise<{ calibreId: number; bookId: number }> {
    if (process.env.ALLOW_CALIBRE_BOOK_CREATION !== "true") {
      throw new BookCreationError("Book creation is disabled. Set ALLOW_CALIBRE_BOOK_CREATION=true to enable it.", 403);
    }
    if (this.creating) throw new BookCreationError("Another book is being added. Wait for it to finish.", 409);
    this.creating = true;
    let calibreId: number | undefined;
    let suspended = false;
    try {
      const duplicateId = this.deps.findDuplicate(input.title, input.authors);
      if (duplicateId !== undefined) {
        throw new BookCreationError("A book with this title and these authors already exists in Calibre. Use Sync Calibre instead.", 409);
      }
      this.deps.watcher.suspend();
      suspended = true;
      calibreId = await this.deps.create(input);
      const result = await this.deps.sync();
      if (!result.success) throw new Error(result.error || "Calibre sync failed");
      const book = await this.deps.findBook(calibreId);
      if (!book) throw new Error("The new book was not found in Tome after sync");
      getLogger().info({ calibreId, bookId: book.id }, "Created metadata-only Calibre book");
      return { calibreId, bookId: book.id };
    } catch (error) {
      getLogger().error({ err: error, calibreId }, "Book creation workflow failed");
      if (calibreId !== undefined) {
        throw new BookCreationError(`Book ${calibreId} was added to Calibre, but Tome could not sync it. Use Sync Calibre; do not add the book again.`, 502, true, calibreId);
      }
      throw error;
    } finally {
      this.creating = false;
      if (suspended) this.deps.watcher.resume();
    }
  }
}

export const bookCreationService = new BookCreationService();
