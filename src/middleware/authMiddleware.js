const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({
        message: 'Access denied'
    });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded._id);

        if (!user || user.token !== token) {
            return res.status(403).json({
                message: 'Invalid or expired session'
            });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({
            message: 'Invalid token'
        });
    }
};

module.exports = verifyToken;