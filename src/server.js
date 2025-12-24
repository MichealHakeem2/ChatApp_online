require('dotenv').config();
const express = require('express'),
    http = require('http'),
    socketIo = require('socket.io'),
    cors = require('cors'),
    connectDB = require('./config/db'),
    Message = require('./models/Message'),
    path = require('path'),
    authRoutes = require('./routes/authRoutes'),
    userRoutes = require('./routes/userRoutes'),
    chatRoutes = require('./routes/chatRoutes'),
    User = require('./models/User'),
    app = express(),
    server = http.createServer(app),
    io = socketIo(server, {
        contentSecurityPolicy: false
    });
connectDB();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
const jwt = require('jsonwebtoken');

io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded._id);
        if (!user || user.token !== token) {
            return next(new Error('Authentication error'));
        }
        socket.userId = decoded._id;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

const onlineUsers = new Map(); // userId -> Set of socketIds

io.on('connection', socket => {
    const userId = socket.userId;
    if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
        io.emit('user_status', {
            userId,
            status: 'online'
        });
    }
    onlineUsers.get(userId).add(socket.id);
    socket.join(userId);
    socket.emit('initial_online_list', Array.from(onlineUsers.keys()));

    socket.on('mark_as_read', async ({
        senderId,
        receiverId
    }) => {
        try {
            await Message.updateMany({
                sender: senderId,
                receiver: receiverId,
                read: false
            }, {
                $set: {
                    read: true
                }
            });
            io.to(senderId).to(receiverId).emit('messages_read', {
                senderId,
                receiverId
            });
        } catch (err) {
            console.error('Error marking as read:', err);
        }
    });
    socket.on('send_message', async data => {
        const {
            sender,
            receiver,
            content,
            fileUrl,
            fileName,
            fileType
        } = data;
        if (sender !== userId.toString()) return;

        try {
            const newMessage = new Message({
                sender,
                receiver,
                content: content || 'Attachment',
                fileUrl,
                fileName,
                fileType
            });
            await newMessage.save();
            io.to(sender).to(receiver).emit('receive_message', newMessage);
        } catch (err) {
            console.error('Error sending message:', err);
        }
    });
    socket.on('disconnect', () => {
        const userSockets = onlineUsers.get(userId);
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                onlineUsers.delete(userId);
                io.emit('user_status', {
                    userId,
                    status: 'offline'
                });
            }
        }
    });
});
app.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));