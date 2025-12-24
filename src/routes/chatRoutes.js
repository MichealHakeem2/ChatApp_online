const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const verifyToken = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

router.get('/history/:friendId', verifyToken, chatController.getChatHistory);
router.post('/upload', verifyToken, upload.single('file'), chatController.uploadFile);

module.exports = router;