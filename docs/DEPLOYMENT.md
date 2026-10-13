# Deployment Guide

This guide covers deploying Tome using Docker, including configuration, volume management, and production best practices.

## Calibre Path
**Note**: Tome requires write access to sync data back to Calibre. You will need to provide an *absolute* path to your Calibre Library folder. Common Calibre library locations:
- **Linux**: `~/Calibre Library/metadata.db`
- **macOS**: `~/Documents/Calibre Library/metadata.db`
- **Windows**: `C:\Users\<username>\Calibre Library\metadata.db`

## Volumes

Tome requires two volume mounts for persistent data and Calibre integration:

| Volume Mount | Container Path | Purpose | Required |
|-------------|----------------|---------|----------|
| `/path/to/storage` | `/app/data` | Tome SQLite database, backups, logs | Yes |
| `/path/to/calibre/library` | `/calibre` | Location of your Calibre library | Yes |

## Docker Deployment Options

Currently, the *only way* to run Tome is through [Docker](https://www.docker.com/). If you're unfamiliar with Docker, I suggest option #1.

### 1. Docker Desktop

[Install Docker Desktop](https://www.docker.com/products/docker-desktop/) and create a container using their GUI, as described in [this article](https://www.educative.io/answers/how-to-create-a-docker-container-in-docker-desktop).

The image is: `ghcr.io/masonfox/tome:latest`. Fill in the volumes detailed above.

### 2. Docker CLI
After replacing the host volume references, run this from the command line or terminal:

```
docker run -d \
  --name tome \
  -p 3000:3000 \
  -v /path/to/storage:/app/data \
  -v /path/to/calibre/library:/calibre \
  -e PUID=1000 \
  -e PGID=1000 \
  --restart unless-stopped \
  ghcr.io/masonfox/tome:latest
```

### 3. Preferred: Docker Compose

```
version: '3.8'

services:
  tome:
    image: ghcr.io/masonfox/tome:latest
    container_name: tome
    ports:
      - "3000:3000"
    environment:
      - AUTH_PASSWORD=hello # remove to disable auth
      # Set PUID/PGID to match your user (run 'id' to find your values)
      - PUID=1000  # Change to your UID
      - PGID=1000  # Change to your GID
    volumes:
      # Persist SQLite database
      - /path/to/storage:/app/data
      # Calibre library
      - /path/to/calibre/folder:/calibre
    restart: unless-stopped
```

**Access the application** at http://localhost:3000. If needed, the `PORT` value in the `.env` can be adjusted to change your local port.


## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Runtime environment |
| `AUTH_PASSWORD` | (none) | Enables authentication when set. Example: `helloworld` |
| `CALIBRE_DB_PATH` | (none) | Path to Calibre metadata.db inside container. Recommended: `/calibre/metadata.db` |
| `ALLOW_CALIBRE_BOOK_CREATION` | `false` | Fork extension: set exactly `true` to enable metadata-only Add Book. Requires this fork's image with Calibre tools. |
| `PORT` | `3000` | Application port |
| `DATABASE_PATH` | `/app/data/tome.db` | Path to Tome's SQLite database |
| `PUID` | `1001` | User ID to run as (for fixing volume permissions) |
| `PGID` | `1001` | Group ID to run as (for fixing volume permissions) |

## Adding Physical Books or Wishlist Entries (This Fork)

This fork can create empty Calibre books without uploading an ebook. It uses
`calibredb add --empty`, not direct SQL inserts, then syncs the book into Tome.
Existing books are not edited by this feature.

For ZimaOS, build an image from **this fork**, rather than using the upstream
`ghcr.io/masonfox/tome:latest` image. The Dockerfile uses Debian and includes
Calibre's command-line tools, so it is larger than the upstream Alpine image.

Published fork releases are available as `ghcr.io/axxes8/tome:0.6.11`
(or `ghcr.io/axxes8/tome:latest` after a successful release).
Set this image in your ZimaOS app configuration, preserving your existing
volume mounts and adding the environment variables below. Release builds
run the test suite and a disposable-library Calibre creation smoke test
before publishing images for both amd64 and arm64.

1. Back up the **entire Calibre library**, including `metadata.db` and book folders.
2. Mount the same entire library folder used by Calibre-Web at `/calibre`,
   read-write. Mounting only `metadata.db` is insufficient.
3. Set `CALIBRE_DB_PATH=/calibre/metadata.db` and
   `ALLOW_CALIBRE_BOOK_CREATION=true`. Set `PUID` and `PGID` to a user/group
   with write permissions on the shared library. Tome does not change the
   ownership of your Calibre mount.
4. Replace the example host library path in this repository's Compose file,
   then run `docker compose up -d --build` on your Docker host. If using the
   ZimaOS app UI, replace the image with your custom-built image and preserve
   your existing Tome data and Calibre mounts.
5. Pause/stop Calibre-Web and close other Calibre library managers before
   adding books. The confirmation checkbox is an acknowledgement, **not**
   automatic coordination with Calibre-Web.
6. Open **Library -> Add Book**. Enter a title and authors (one per line),
   plus optional ISBN and tags. Submit and wait for Tome to open the new book.
7. Resume Calibre-Web afterward; refresh/restart it if it has cached the old
   library contents.

Creation is disabled unless explicitly enabled. Existing ratings, tags and
sync behavior remain available when disabled. Keep a single Tome instance.
Tome's internal guard does not prevent another application from writing to
the library. Do not expose a write-enabled instance publicly without access
controls.

If creation succeeds in Calibre but Tome sync fails, the form reports that
the book may already exist and disables resubmission. Use **Sync Calibre**
after checking the library; do not add it again. Timeouts and unexpected
command output likewise require checking the library first. Exact title and
author-set duplicates are rejected, but this is not a fuzzy duplicate finder.

## PUID/PGID Support

Tome supports PUID (User ID) and PGID (Group ID) environment variables to eliminate volume permission issues. This feature allows the container to run with the same user/group IDs as your host system, ensuring seamless file access.

### Finding Your UID/GID

On your host system, run:
```bash
id
```

This will output something like:
```
uid=1000(username) gid=1000(groupname) groups=1000(groupname),...
```

Use the `uid` and `gid` values for PUID and PGID.

### Common PUID/PGID Values

| System | Typical PUID | Typical PGID | Notes |
|--------|---------------|-------|-------|
| Linux (first user) | `1000` | `1000` | Most common on Linux machines |
| Docker default | `1001` | `1001` | Tome's default if not specified |
| Synology | `1026` | `100` | Check your NAS user settings |
| macOS/Windows + Docker Desktop | N/A | N/A | Less critical due to virtualization |

### Configuration Examples

**Docker Compose** (recommended):
```yaml
services:
  tome:
    image: ghcr.io/masonfox/tome:latest
    environment:
      - PUID=1000
      - PGID=1000
```

**Docker CLI**:
```bash
docker run -d \
  -e PUID=1000 \
  -e PGID=1000 \
  ghcr.io/masonfox/tome:latest
```

## Database Backups

### Using Built-in Backup Scripts

Tome includes automated backup scripts that work inside the container:

```bash
# Create a timestamped backup
docker exec tome npm run db:backup

# List available backups
docker exec tome npm run db:list-backups

# Restore from backup (interactive)
docker exec -it tome npm run db:restore
```

Backups are stored in `data/backups/` inside the container (part of the `tome-data` volume).

## Database Migrations

Tome uses Drizzle ORM for database schema management. The migrations run automatically on container startup (before the app starts).

If needed, you can run migrations manually:

```bash
docker exec -it tome npm run db:migrate
```

**However**, you're encouraged to run backups _before_ manually running migrations:

```bash
docker exec tome npm run db:backup
```
This is done automatically on container startup.

## Common Issues

### Permission Errors

**Recommended Solution**: Use PUID/PGID environment variables (see above). This automatically fixes permissions on container startup.

### Port Conflicts

If port 3000 is already in use on your host, remap your container's **external** port:

**Compose**:
```yaml
ports:
  - "3001:3000"
```
or via **CLI**:
```bash
-p 3001:3000
```

### Calibre Database Not Accessible

Verify the mount path and permissions:

```bash
# Check if file exists inside container
docker exec tome ls -l /calibre/metadata.db

# Verify environment variable
docker exec tome printenv CALIBRE_DB_PATH
```

## Support

For additional help:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Review [DATABASE.md](./DATABASE.md) for database operations
- Open an issue on GitHub
