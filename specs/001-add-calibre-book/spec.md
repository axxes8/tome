# Feature Specification: Add Metadata-Only Calibre Books

**Feature Branch**: `001-add-calibre-book`
**Created**: 2026-10-13
**Status**: Approved scope
**Input**: Add books to the library in a ZimaOS-hosted Tome fork and persist
them in the shared Calibre library.

## User Scenarios & Testing

### User Story 1 - Track a Physical Book (Priority: P1)

As a reader, I can add a physical book or wishlist entry without an ebook
file and see the same entry in both Tome and Calibre-Web.

**Why this priority**: Readers need to track books not already in their
digital library.

**Independent Test**: Add a book with a title and authors; verify one new
entry exists in each application and can be tracked in Tome.

**Acceptance Scenarios**:

1. **Given** creation is enabled and other library managers are paused,
   **when** I enter valid book details, **then** one metadata-only book is
   saved to Calibre and opens in Tome.
2. **Given** I enter an existing title and author set, **when** I submit,
   **then** the duplicate is rejected and existing records are unchanged.
3. **Given** creation is disabled, **when** I open the library, **then**
   existing browsing and sync work without an Add Book action.

### User Story 2 - Recover Without Duplicates (Priority: P1)

As a reader, I know whether an unsuccessful addition might already have
saved a book, so I do not accidentally add it twice.

**Why this priority**: Calibre library integrity is more important than
hiding integration failures.

**Independent Test**: Simulate a saved book followed by failed Tome sync;
verify actionable feedback and disabled resubmission.

**Acceptance Scenarios**:

1. **Given** Calibre saved the book but Tome cannot sync, **when** the
   operation finishes, **then** I am told to sync, not to add it again.
2. **Given** a response is lost, **when** the form reports failure,
   **then** I must check the library before attempting another addition.
3. **Given** invalid details, **when** I submit, **then** I can correct
   them without losing the form.

### Edge Cases

- Missing or unwritable library: reject rather than create a new library.
- Concurrent additions: reject the overlapping request.
- No acknowledgement of paused library managers: reject the request.
- Invalid ISBN, empty title, invalid author/tag lists: reject before writing.
- Unexpected creation confirmation or timeout: report uncertain outcome
  and do not retry automatically.

## Requirements

### Functional Requirements

- **FR-001**: Creation MUST be opt-in and disabled by default.
- **FR-002**: Readers MUST supply a title and at least one author; ISBN
  and tags are optional.
- **FR-003**: The system MUST create metadata-only books with no ebook upload.
- **FR-004**: Existing book metadata and reading history MUST remain unchanged.
- **FR-005**: The reader MUST acknowledge that other library managers are
  paused before saving to the shared library.
- **FR-006**: Successful additions MUST appear in both Calibre and Tome.
- **FR-007**: Partial and uncertain outcomes MUST be distinguished from
  success and MUST NOT trigger automatic creation retries.
- **FR-008**: Exact case-insensitive title and author-set duplicates MUST
  be rejected. Fuzzy duplicate matching is outside scope.
- **FR-009**: Deployment guidance MUST explain backups, shared-folder
  permissions and how to deploy this fork rather than the upstream image.

### Key Entities

- **Book details**: Title, authors, optional ISBN and tags.
- **Calibre book**: The authoritative library entry, without an ebook format.
- **Tome book**: The synchronized entry used for reading tracking.

## Assumptions

- The user approved this fork extending Tome's read-primary policy for new
  metadata-only books; editing existing metadata remains out of scope.
- The user approved bundling Calibre tools and a larger Docker image.
- Calibre-Web accesses the same entire library folder as Tome.
- A single Tome instance is deployed; external managers are paused manually.
- Ebook uploads, cover uploads and online metadata lookup are outside scope.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Each successful submission creates exactly one book in the
  authoritative library and one synchronized entry in Tome.
- **SC-002**: All tested invalid-input cases make zero library changes.
- **SC-003**: Every tested saved-but-unsynchronized or uncertain outcome
  gives recovery guidance and disables immediate resubmission.
- **SC-004**: With creation disabled, library browsing and existing sync
  remain available without exposing creation controls.
