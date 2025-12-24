const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateTokens = (user) => {
    const accessToken = jwt.sign({
        _id: user._id
    }, process.env.JWT_SECRET, {
        expiresIn: '1h'
    });
    return {
        accessToken,
    };
};

exports.register = async (req, res) => {
    try {
        const {
            username,
            email,
            password
        } = req.body;
        let user = await User.findOne({
            email
        });
        if (user) return res.status(400).json({
            error: 'User already exists'
        });

        user = new User({
            username,
            email,
            password
        });
        await user.save();

        const {
            accessToken
        } = generateTokens(user);
        user.token = accessToken;
        await user.save();

        res.json({
            accessToken,
            userId: user._id,
            username: user.username
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.login = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;
        const user = await User.findOne({
            email
        });

        if (!user) return res.status(400).json({
            message: 'Invalid credentials'
        });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({
            message: 'Invalid credentials'
        });

        const {
            accessToken
        } = generateTokens(user);
        user.token = accessToken;
        await user.save();

        res.json({
            accessToken,
            userId: user._id,
            username: user.username
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.logout = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.token = '';
            await user.save();
        }
        res.json({
            message: 'Logged out successfully'
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};