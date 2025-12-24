const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/me', verifyToken, userController.getMe);
router.get('/friends', verifyToken, userController.getFriends);
router.get('/search', verifyToken, userController.searchUsers);
router.get('/profile/:id', verifyToken, userController.getFriendProfile);

router.post('/add', verifyToken, userController.addFriend);
router.post('/upload/profile', verifyToken, upload.single('image'), userController.uploadProfilePic);
router.post('/upload/wallpaper', verifyToken, upload.single('image'), userController.uploadWallpaper);

module.exports = router;