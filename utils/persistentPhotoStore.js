const path = require('path');
const fs = require('fs');
const pool = require('../config/db');


class PersistentPhotoStore {
  constructor() {
    this.tableName = 'profile_photos_storage';
    this.tableInitialized = false;
    this.defaultUploadDir = path.join(__dirname, '../public/uploads/profiles');
  }


  getUploadDir() {
    const dir = process.env.UPLOAD_DIR || this.defaultUploadDir;
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn('[PersistentPhotoStore Warning]: Failed to create upload dir:', err.message);
      }
    }
    return dir;
  }


  async init() {
    if (this.tableInitialized) return;

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${this.tableName}\` (
        \`filename\` VARCHAR(255) NOT NULL,
        \`data\` MEDIUMBLOB NOT NULL,
        \`mime_type\` VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
        \`size\` INT NOT NULL DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`filename\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    try {
      await pool.query(createTableQuery);
      this.tableInitialized = true;
      console.log('[PersistentPhotoStore]: Persistent storage table verified.');

      // Synchronize existing local profile pictures into persistent storage
      await this.syncLocalUploadsToDb();
    } catch (err) {
      console.error('[PersistentPhotoStore Error]: Could not initialize storage table:', err.message);
    }
  }


  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.gif': return 'image/gif';
      case '.webp': return 'image/webp';
      case '.svg': return 'image/svg+xml';
      case '.jpeg':
      case '.jpg':
      default:
        return 'image/jpeg';
    }
  }


  async save(filename, fileSource, mimeType) {
    if (!filename) return false;
    try {
      await this.init();

      let buffer;
      if (Buffer.isBuffer(fileSource)) {
        buffer = fileSource;
      } else if (typeof fileSource === 'string' && fs.existsSync(fileSource)) {
        buffer = await fs.promises.readFile(fileSource);
      } else {
        // Check if file exists in upload dir
        const fullPath = path.join(this.getUploadDir(), filename);
        if (fs.existsSync(fullPath)) {
          buffer = await fs.promises.readFile(fullPath);
        } else {
          return false;
        }
      }

      if (!buffer || buffer.length === 0) return false;

      const detectedMime = mimeType || this.getMimeType(filename);
      const size = buffer.length;

      const query = `
        INSERT INTO \`${this.tableName}\` (\`filename\`, \`data\`, \`mime_type\`, \`size\`)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`data\` = VALUES(\`data\`),
          \`mime_type\` = VALUES(\`mime_type\`),
          \`size\` = VALUES(\`size\`),
          \`updated_at\` = CURRENT_TIMESTAMP
      `;

      await pool.query(query, [filename, buffer, detectedMime, size]);
      return true;
    } catch (err) {
      console.error(`[PersistentPhotoStore]: Failed to save ${filename}:`, err.message);
      return false;
    }
  }


  async get(filename) {
    if (!filename) return null;
    try {
      await this.init();

      const [rows] = await pool.query(
        `SELECT \`data\`, \`mime_type\` FROM \`${this.tableName}\` WHERE \`filename\` = ? LIMIT 1`,
        [filename]
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        data: row.data,
        mime_type: row.mime_type || this.getMimeType(filename)
      };
    } catch (err) {
      console.warn(`[PersistentPhotoStore]: Failed to fetch ${filename}:`, err.message);
      return null;
    }
  }

  async restoreToDisk(filename, targetDir) {
    const photo = await this.get(filename);
    if (!photo || !photo.data) return false;

    const dir = targetDir || this.getUploadDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, filename);
    try {
      await fs.promises.writeFile(filePath, photo.data);
      return true;
    } catch (err) {
      console.warn(`[PersistentPhotoStore]: Error restoring ${filename} to disk:`, err.message);
      return false;
    }
  }

  async syncLocalUploadsToDb() {
    const dir = this.getUploadDir();
    if (!fs.existsSync(dir)) return;

    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      // Only process profile photo images
      if (file.startsWith('profile_') && /\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
        try {
          const [exists] = await pool.query(
            `SELECT 1 FROM \`${this.tableName}\` WHERE \`filename\` = ? LIMIT 1`,
            [file]
          );

          if (!exists || exists.length === 0) {
            const filePath = path.join(dir, file);
            await this.save(file, filePath);
            console.log(`[PersistentPhotoStore]: Synced existing local file to persistent store: ${file}`);
          }
        } catch (_e) { }
      }
    }
  }
}

const persistentPhotoStore = new PersistentPhotoStore();
module.exports = persistentPhotoStore;
