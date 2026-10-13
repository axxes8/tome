"use client";

import { useState, type FormEvent } from "react";
import BaseModal from "@/components/Modals/BaseModal";
import { Button } from "@/components/Utilities/Button";

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (bookId: number) => void;
}

export function AddBookModal({ isOpen, onClose, onCreated }: AddBookModalProps) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [isbn, setIsbn] = useState("");
  const [tags, setTags] = useState("");
  const [libraryPaused, setLibraryPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mustCheckLibrary, setMustCheckLibrary] = useState(false);

  function close() {
    if (saving) return;
    setTitle("");
    setAuthors("");
    setIsbn("");
    setTags("");
    setLibraryPaused(false);
    setError("");
    setMustCheckLibrary(false);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || mustCheckLibrary) return;
    setSaving(true);
    setError("");
    let bookId: number | undefined;
    try {
      const response = await fetch("/api/books/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          authors: authors.split("\n").map(author => author.trim()).filter(Boolean),
          isbn: isbn.trim(),
          tags: tags.split(",").map(tag => tag.trim()).filter(Boolean),
          libraryPaused,
        }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw new Error("Invalid server response");
      const result = data as Record<string, unknown>;
      if (!response.ok) {
        setMustCheckLibrary(result.mayHaveCreated === true);
        setError(typeof result.error === "string" ? result.error : "Failed to add book.");
      } else if (typeof result.bookId === "number" && Number.isSafeInteger(result.bookId) && result.bookId > 0) {
        bookId = result.bookId;
      } else {
        throw new Error("The server did not confirm the new book");
      }
    } catch (error) {
      setMustCheckLibrary(true);
      setError(`Could not confirm whether the book was added. Check Calibre-Web and use Sync Calibre before adding it again. ${error instanceof Error ? error.message : ""}`);
    } finally {
      setSaving(false);
    }
    if (bookId !== undefined) {
      onClose();
      onCreated(bookId);
    }
  }

  const inputClass = "w-full px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={close}
      title="Add Book"
      subtitle="Add a physical book or wishlist entry to Calibre. No ebook file is required."
      size="lg"
      allowBackdropClose={false}
      actions={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" form="add-calibre-book" disabled={saving || !libraryPaused || mustCheckLibrary}>
            {saving ? "Adding..." : "Add Book"}
          </Button>
        </>
      }
    >
      <form id="add-calibre-book" onSubmit={submit} className="space-y-4">
        <fieldset disabled={saving || mustCheckLibrary} className="space-y-4">
          <div>
            <label htmlFor="new-book-title" className="block text-sm font-medium mb-2">Title *</label>
            <input id="new-book-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={500} className={inputClass} />
          </div>
          <div>
            <label htmlFor="new-book-authors" className="block text-sm font-medium mb-2">Authors * (one per line)</label>
            <textarea id="new-book-authors" value={authors} onChange={event => setAuthors(event.target.value)} required rows={3} className={inputClass} />
          </div>
          <div>
            <label htmlFor="new-book-isbn" className="block text-sm font-medium mb-2">ISBN (optional)</label>
            <input id="new-book-isbn" value={isbn} onChange={event => setIsbn(event.target.value)} maxLength={32} className={inputClass} />
          </div>
          <div>
            <label htmlFor="new-book-tags" className="block text-sm font-medium mb-2">Tags (optional, comma-separated)</label>
            <input id="new-book-tags" value={tags} onChange={event => setTags(event.target.value)} maxLength={5049} className={inputClass} />
          </div>
          <p className="text-sm text-[var(--subheading-text)]">
            Back up your Calibre library first. Pause Calibre-Web and close any other Calibre library managers before adding a book. Resume them after the operation finishes.
          </p>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={libraryPaused} onChange={event => setLibraryPaused(event.target.checked)} />
            I have paused Calibre-Web and other library managers.
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saving && <p role="status" className="text-sm">Adding to Calibre and syncing into Tome. Please wait.</p>}
      </form>
    </BaseModal>
  );
}
