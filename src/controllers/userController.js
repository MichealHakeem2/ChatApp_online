const User = require('../models/User');

exports.uploadProfilePic = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.user._id, {
            profilePic: '/uploads/' + req.file.filename
        }, {
            new: true
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};
exports.uploadWallpaper = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.user._id, {
            wallpaper: '/uploads/' + req.file.filename
        }, {
            new: true
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.addFriend = async (req, res) => {
    try {
        const {
            friendUsername
        } = req.body;
        console.log('Searching for friend to add:', friendUsername);
        const friend = await User.findOne({
            username: {
                $regex: new RegExp(`^${friendUsername}$`, 'i')
            }
        });
        const user = await User.findById(req.user._id);

        if (!friend) return res.status(404).json({
            message: 'User not found'
        });
        if (user.friends.some(id => id.toString() === friend._id.toString())) return res.status(400).json({
            message: 'Already friends'
        });
        if (user.username === friendUsername) return res.status(400).json({
            message: 'Cannot add yourself'
        });

        user.friends.push(friend._id);
        friend.friends.push(user._id);
        await user.save();
        await friend.save();

        res.json({
            message: 'Friend added',
            friend: {
                _id: friend._id,
                username: friend.username,
                profilePic: friend.profilePic
            }
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.getFriends = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('friends', 'username profilePic');
        const Message = require('../models/Message');

        const friendsWithStats = await Promise.all(user.friends.filter(f => f).map(async (friend) => {
            const lastMessage = await Message.findOne({
                $or: [{
                    sender: req.user._id,
                    receiver: friend._id
                }, {
                    sender: friend._id,
                    receiver: req.user._id
                }]
            }).sort({
                createdAt: -1
            });

            const unreadCount = await Message.countDocuments({
                sender: friend._id,
                receiver: req.user._id,
                read: false
            });

            return {
                ...friend._doc,
                lastMessage,
                unreadCount
            };
        }));

        res.json(friendsWithStats);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.searchUsers = async (req, res) => {
    try {
        const keyword = req.query.keyword;
        const users = await User.find({
            username: {
                $regex: keyword,
                $options: 'i'
            }
        }).select('username profilePic');
        res.json(users);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.getFriendProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('username profilePic email');
        if (!user) return res.status(404).json({
            message: 'User not found'
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};