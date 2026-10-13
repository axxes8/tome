export interface CalibreBookInput {
  title: string;
  authors: string[];
  isbn?: string;
  tags: string[];
}

export class BookCreationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly mayHaveCreated = false,
    public readonly calibreId?: number
  ) {
    super(message);
    this.name = "BookCreationError";
  }
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new BookCreationError(`${field} must be non-empty text of at most ${maxLength} characters.`, 400);
  }
  return value.trim();
}

export function parseCalibreBookInput(value: unknown): CalibreBookInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BookCreationError("Book details must be an object.", 400);
  }
  const body = value as Record<string, unknown>;
  if (body.libraryPaused !== true) {
    throw new BookCreationError("Confirm that Calibre-Web and other Calibre library managers are paused before adding a book.", 400);
  }
  const title = text(body.title, "Title", 500);
  if (!Array.isArray(body.authors) || body.authors.length < 1 || body.authors.length > 20) {
    throw new BookCreationError("Provide between 1 and 20 authors.", 400);
  }
  const authors = [...new Set(body.authors.map(author => text(author, "Author", 200)))];
  if (authors.some(author => author.includes("&"))) {
    throw new BookCreationError("Enter each author separately, without '&' (Calibre's author separator).", 400);
  }
  const rawTags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 50) {
    throw new BookCreationError("Provide at most 50 tags.", 400);
  }
  const tags = [...new Set(rawTags.map(tag => text(tag, "Tag", 100)))];
  if (tags.some(tag => tag.includes(","))) {
    throw new BookCreationError("Enter tags separately, without commas.", 400);
  }
  let isbn: string | undefined;
  if (body.isbn !== undefined && body.isbn !== "") {
    isbn = text(body.isbn, "ISBN", 32).replace(/[- ]/g, "").toUpperCase();
    if (!/^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(isbn)) {
      throw new BookCreationError("ISBN must contain 10 or 13 digits (a final X is allowed for ISBN-10).", 400);
    }
  }
  return { title, authors, isbn, tags };
}
