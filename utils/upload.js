const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const persistentPhotoStore = require('./persistentPhotoStore');

const uploadDir = persistentPhotoStore.getUploadDir();

// Configure storage for profile photos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, persistentPhotoStore.getUploadDir());
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const userId = (req.session && req.session.userId) ? req.session.userId : 'user';
    const randomHex = crypto.randomBytes(4).toString('hex');
    cb(null, `profile_${userId}_${Date.now()}_${randomHex}${ext}`);
  }
});

// File filter to accept images
const fileFilter = (req, file, cb) => {
  if (file && file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else if (!file) {
    cb(null, true);
  } else {
    cb(null, true); // Don't reject or crash, let multer proceed
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Wrap Multer middleware methods to ensure idempotency and persistent storage.
// If a request's multipart body has already been parsed upstream (e.g. by central CSRF validation),
// downstream route middlewares won't attempt to re-consume the already-read stream or reset req.body.
function wrapMulterMethod(originalMethod) {
  return function (...args) {
    const middleware = originalMethod.apply(upload, args);
    return function (req, res, next) {
      if (req._multerParsed) {
        return next();
      }
      middleware(req, res, async function (err) {
        if (!err) {
          req._multerParsed = true;

          const optimizeAndSave = async (f) => {
            if (!f || !f.path) return;
            try {
              if (f.mimetype && f.mimetype.startsWith('image/')) {
                const sharp = require('sharp');
                const fileBuf = await fs.promises.readFile(f.path);
                const compressedBuf = await sharp(fileBuf)
                  .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
                  .jpeg({ quality: 82, progressive: true })
                  .toBuffer();
                await fs.promises.writeFile(f.path, compressedBuf);
                f.size = compressedBuf.length;
              }
            } catch (optErr) {
              console.warn('[Image Optimize Notice]:', optErr.message);
            }

            persistentPhotoStore.save(f.filename, f.path, f.mimetype).catch(e => {
              console.warn('[Upload Persistence Notice]:', e.message);
            });
          };

          // Automatically backup newly uploaded files to persistent MySQL storage
          if (req.file) {
            await optimizeAndSave(req.file);
          }
          if (req.files) {
            const fileList = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
            for (const f of fileList) {
              await optimizeAndSave(f);
            }
          }
        }
        next(err);
      });
    };
  };
}

upload.single = wrapMulterMethod(upload.single.bind(upload));
upload.any = wrapMulterMethod(upload.any.bind(upload));
upload.array = wrapMulterMethod(upload.array.bind(upload));
upload.fields = wrapMulterMethod(upload.fields.bind(upload));
upload.none = wrapMulterMethod(upload.none.bind(upload));

module.exports = upload;

