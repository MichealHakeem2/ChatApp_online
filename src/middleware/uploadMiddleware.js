const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads';
        console.log('Using relative upload path:', uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        console.log('Multer filtering file:', file.originalname, 'type:', file.mimetype);
        const filetypes = /jpeg|jpg|png|gif|pdf|docx|doc|xls|xlsx|txt|webm|mp3|ogg|wav/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype || extname) {
            return cb(null, true);
        }
        cb(new Error('Error: File type not supported!'));
    }
});

module.exports = upload;