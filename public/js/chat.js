const socket = io({
    auth: {
        token: localStorage.getItem('accessToken')
    }
});
const token = localStorage.getItem('accessToken');
const myId = localStorage.getItem('userId');
const myUsername = localStorage.getItem('username');
if (!token) location.href = 'index.html';

let currentFriendId = null;
let selectedFriendObject = null;
let currentlyOnline = new Set();
let pendingFile = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function authenticatedFetch(url, options = {}) {
    let token = localStorage.getItem('accessToken');
    const fetchOptions = {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (options.body instanceof FormData) {
        delete fetchOptions.headers['Content-Type'];
    }

    let response = await fetch(url, fetchOptions);

    if (response.status === 401 || response.status === 403) {
        logout();
        return;
    }

    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Server error: ${response.status}`;
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
        } else {
            errorMessage = await response.text();
            console.error('Non-JSON Error Response:', errorMessage.substring(0, 100));
            if (errorMessage.length > 200) errorMessage = errorMessage.substring(0, 197) + '...';
        }
        throw new Error(errorMessage);
    }

    return response;
}

document.addEventListener('DOMContentLoaded', async () => {
    const profileLoaded = await loadMyProfile();
    if (profileLoaded) {
        loadFriends();
        setupProfileUpload();
        setupFriendSearch();
        setupEmojiPicker();
        setupChatFileUpload();
        setupPendingFileHandlers();
        setupAudioRecording();
    }
});

function setupFriendSearch() {
    const input = document.getElementById('friend-search-input');
    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.chat-item');

        items.forEach(item => {
            const name = item.querySelector('.chat-name').innerText.toLowerCase();
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });
}

async function loadMyProfile() {
    try {
        const res = await authenticatedFetch('/api/users/me');
        if (!res || !res.ok) return false;
        const data = await res.json();
        document.getElementById('my-profile-pic').src = data.profilePic || '/images/default-profile.png';
        if (data.wallpaper) {
            document.getElementById('messages-container').style.backgroundImage = `url(${data.wallpaper})`;
        }
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function logout() {
    try {
        await authenticatedFetch('/api/auth/logout', {
            method: 'POST'
        });
    } catch (err) {
        console.error('Logout error:', err);
    }
    localStorage.clear();
    location.href = 'index.html';
}

async function loadFriends() {
    try {
        const res = await authenticatedFetch('/api/users/friends');
        const friends = await res.json();
        const list = document.getElementById('friends-list');
        list.innerHTML = '';

        friends.forEach(friend => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.id = `chat-item-${friend._id}`;
            div.onclick = () => selectFriend(friend);

            const lastMsgText = friend.lastMessage ? (friend.lastMessage.sender === myId ? 'You: ' : '') + friend.lastMessage.content : 'Click to chat';
            const unreadBadge = friend.unreadCount > 0 ? `<div class="unread-badge" id="unread-${friend._id}">${friend.unreadCount}</div>` : '';
            const isOnline = currentlyOnline.has(friend._id);

            div.innerHTML = `
                <div class="img-container" onclick="showFriendProfile(event, '${friend._id}')">
                    <img src="${friend.profilePic || '/images/default-profile.png'}" alt="pic">
                    <div class="status-dot ${isOnline ? 'online' : ''}" id="status-dot-${friend._id}"></div>
                </div>
                <div class="chat-details">
                    <div class="chat-main-info">
                        <div class="chat-name">${friend.username}</div>
                        ${unreadBadge}
                    </div>
                    <div class="chat-last-msg" id="last-msg-${friend._id}">${lastMsgText}</div>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (err) {
        console.error(err);
    }
}

function toggleAddFriend() {
    const section = document.getElementById('add-friend-section');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function searchAndAddFriend() {
    const input = document.getElementById('search-friend-input');
    const username = input.value.trim();
    if (!username) return alert('Please enter a username');

    try {
        console.log('Attempting to add friend:', username);
        const res = await authenticatedFetch('/api/users/add', {
            method: 'POST',
            body: JSON.stringify({
                friendUsername: username
            })
        });

        const data = await res.json();
        console.log('Add friend response:', data);
        if (res.ok) {
            alert(data.message || 'Friend added successfully!');
            loadFriends();
            input.value = '';
            toggleAddFriend();
        } else {
            alert(data.message || data.error || 'Failed to add friend');
        }
    } catch (err) {
        console.error('Add friend error:', err);
        alert(err.message || 'An unexpected error occurred');
    }
}

async function selectFriend(friend) {
    selectedFriendObject = friend;
    currentFriendId = friend._id;

    // UI Transitions
    const inputArea = document.getElementById('chat-input-area');
    inputArea.classList.remove('d-none');
    inputArea.classList.add('d-flex');

    // Active Highlight
    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    const activeItem = document.getElementById(`chat-item-${friend._id}`);
    if (activeItem) activeItem.classList.add('active');

    document.getElementById('current-friend-name').innerText = friend.username;
    document.getElementById('current-friend-pic').src = friend.profilePic || '/images/default-profile.png';

    const friendDot = document.getElementById(`status-dot-${friend._id}`);
    const headerDot = document.getElementById('header-status-dot');
    if (friendDot && friendDot.classList.contains('online')) {
        headerDot.classList.add('online');
    } else {
        headerDot.classList.remove('online');
    }

    socket.emit('mark_as_read', {
        senderId: friend._id,
        receiverId: myId
    });

    const unread = document.getElementById(`unread-${friend._id}`);
    if (unread) unread.remove();

    socket.emit('join_room', {
        myId,
        friendId: currentFriendId
    });
    loadMessages(friend._id);
}

async function loadMessages(friendId) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    try {
        const res = await authenticatedFetch(`/api/chat/history/${friendId}`);
        const messages = await res.json();
        messages.forEach(msg => appendMessage(msg));
        scrollToBottom();
    } catch (err) {
        console.error(err);
    }
}

function appendMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    const isMe = msg.sender === myId;
    div.className = `message ${isMe ? 'message-sent' : 'message-received'}`;

    let contentHtml = msg.content;
    if (msg.fileUrl) {
        if (msg.fileType && msg.fileType.startsWith('image/')) {
            contentHtml = `<img src="${msg.fileUrl}" style="max-width: 250px; border-radius: 8px; cursor: pointer; display: block; margin-bottom: 5px;" onclick="open('${msg.fileUrl}')">`;
        } else if (msg.fileType && msg.fileType.startsWith('audio/')) {
            contentHtml = `<audio controls src="${msg.fileUrl}" style="max-width: 200px;"></audio>`;
        } else {
            const icon = (msg.fileType && msg.fileType.includes('pdf')) ? 'fa-file-pdf' : 'fa-file';
            contentHtml = `<a href="${msg.fileUrl}" target="_blank" class="file-attachment"><i class="fas ${icon}"></i><span>${msg.fileName || 'Attachment'}</span></a>`;
        }
        if (msg.content && msg.content !== 'Attachment') {
            contentHtml += `<p style="margin-top: 5px;">${msg.content}</p>`;
        }
    }

    const statusIcon = isMe ? `<i class="fas fa-check-double message-status ${msg.read ? 'read' : ''}" id="status-${msg._id}"></i>` : '';

    div.innerHTML = `
        <div class="message-content">
            ${contentHtml}
            <div class="message-time-container">
                <span class="message-time">${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                ${statusIcon}
            </div>
        </div>
    `;
    container.appendChild(div);
}

const msgInput = document.getElementById('message-input');
msgInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') handleSendAction();
});

msgInput.addEventListener('input', () => {
    const micBtn = document.getElementById('mic-btn');
    const icon = micBtn.querySelector('i');
    if (msgInput.value.trim() || pendingFile) {
        icon.classList.remove('fa-microphone');
        icon.classList.add('fa-paper-plane', 'text-wa-success');
        micBtn.onclick = handleSendAction;
    } else {
        icon.classList.remove('fa-paper-plane', 'text-wa-success');
        icon.classList.add('fa-microphone');
        micBtn.onclick = toggleRecording;
    }
});

async function handleSendAction() {
    if (!currentFriendId) return;
    const content = msgInput.value.trim();
    if (!content && !pendingFile) return;

    let fileData = null;
    if (pendingFile) {
        fileData = await uploadPendingFile();
        if (!fileData) return;
    }

    socket.emit('send_message', {
        sender: myId,
        receiver: currentFriendId,
        content: content || (fileData ? 'Attachment' : ''),
        fileUrl: fileData ? fileData.fileUrl : null,
        fileName: fileData ? fileData.fileName : null,
        fileType: fileData ? fileData.fileType : null
    });

    msgInput.value = '';
    clearPendingFile();
    msgInput.dispatchEvent(new Event('input'));
}

async function uploadPendingFile() {
    const formData = new FormData();
    formData.append('file', pendingFile);
    try {
        const res = await authenticatedFetch('/api/chat/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok) return data;
        alert(data.error || 'Upload failed');
        return null;
    } catch (err) {
        console.error(err);
        alert('An error occurred during upload');
        return null;
    }
}

function setupPendingFileHandlers() {
    document.getElementById('cancel-file-upload').onclick = clearPendingFile;
}

function clearPendingFile() {
    pendingFile = null;
    document.getElementById('chat-file-input').value = '';
    const bar = document.getElementById('pending-file-bar');
    bar.classList.add('d-none');
    bar.classList.remove('d-flex');
    document.getElementById('pending-file-name').innerText = '';
    document.getElementById('message-input').dispatchEvent(new Event('input'));
}

socket.on('initial_online_list', (onlineIds) => {
    currentlyOnline = new Set(onlineIds);
    updateStatusDots();
});

socket.on('user_status', ({
    userId,
    status
}) => {
    if (status === 'online') currentlyOnline.add(userId);
    else currentlyOnline.delete(userId);
    updateStatusDots();
});

function updateStatusDots() {
    document.querySelectorAll('.status-dot').forEach(dot => {
        const id = dot.id.replace('status-dot-', '');
        if (currentlyOnline.has(id)) dot.classList.add('online');
        else dot.classList.remove('online');
    });

    if (currentFriendId) {
        const headerDot = document.getElementById('header-status-dot');
        if (currentlyOnline.has(currentFriendId)) headerDot.classList.add('online');
        else headerDot.classList.remove('online');
    }
}

socket.on('receive_message', (msg) => {
    if (msg.sender === currentFriendId || msg.sender === myId) {
        appendMessage(msg);
        scrollToBottom();
        if (msg.sender === currentFriendId) {
            socket.emit('mark_as_read', {
                senderId: currentFriendId,
                receiverId: myId
            });
        }
    }
    updateLastMessage(msg);
});

socket.on('messages_read', ({
    senderId,
    receiverId
}) => {
    if (senderId === myId && receiverId === currentFriendId) {
        document.querySelectorAll('.message-status').forEach(icon => icon.classList.add('read'));
    }
});

function updateLastMessage(msg) {
    const friendId = msg.sender === myId ? msg.receiver : msg.sender;
    const lastMsgEl = document.getElementById(`last-msg-${friendId}`);
    if (lastMsgEl) {
        const prefix = msg.sender === myId ? 'You: ' : '';
        lastMsgEl.innerText = prefix + msg.content;
    }
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
}

async function setupProfileUpload() {
    const input = document.getElementById('wallpaper-upload');
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('wallpaper', file);

        try {
            const res = await authenticatedFetch('/api/users/upload/wallpaper', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                const container = document.getElementById('messages-container');
                container.style.backgroundImage = `url(${data.wallpaperUrl})`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundRepeat = 'no-repeat';
                container.style.backgroundPosition = 'center';
                alert('Wallpaper updated!');
            }
        } catch (err) {
            console.error(err);
        }
    });
}

function showFriendProfile(event, targetId) {
    const triggerElement = event.currentTarget;
    const popover = document.getElementById('profile-popover');
    const pic = document.getElementById('popover-pic');
    const name = document.getElementById('popover-name');
    const email = document.getElementById('popover-email');
    const status = document.getElementById('popover-status');

    try {
        const res = authenticatedFetch(`/api/users/profile/${targetId}`).then(r => r.json()).then(data => {
            pic.src = data.profilePic || '/images/default-profile.png';
            name.innerText = data.username;
            if (email) email.innerText = data.email || '';
            const isOnline = currentlyOnline.has(targetId);
            status.innerText = isOnline ? 'Status: Online' : 'Status: Offline';
            status.style.color = isOnline ? '#00a884' : '#aebac1';
        });

        const rect = triggerElement.getBoundingClientRect();
        popover.style.display = 'block';
        popover.style.top = rect.bottom + 10 + 'px';
        popover.style.left = rect.left + 'px';

        const popoverWidth = 200;
        const popoverHeight = 220;

        let left = rect.left;
        if (left + popoverWidth > innerWidth) left = innerWidth - popoverWidth - 20;
        if (left < 10) left = 10;
        popover.style.left = left + 'px';

        let top = rect.bottom + 10;
        if (top + popoverHeight > innerHeight) top = rect.top - popoverHeight - 10;
        if (top < 10) top = 10;
        popover.style.top = top + 'px';

        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && !triggerElement.contains(e.target)) {
                    closePopover();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    } catch (err) {
        console.error(err);
        popover.style.display = 'none';
    }
}

function closePopover() {
    document.getElementById('profile-popover').style.display = 'none';
}

function setupEmojiPicker() {
    const trigger = document.getElementById('emoji-trigger');
    const container = document.getElementById('emoji-picker-container');
    const picker = container.querySelector('emoji-picker');
    const input = document.getElementById('message-input');

    trigger.onclick = (e) => {
        e.stopPropagation();
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    };

    picker.addEventListener('emoji-click', event => {
        input.value += event.detail.unicode;
        input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && e.target !== trigger) {
            container.style.display = 'none';
        }
    });
}

function setupChatFileUpload() {
    const input = document.getElementById('chat-file-input');
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !currentFriendId) return;

        pendingFile = file;
        document.getElementById('pending-file-name').innerText = file.name;
        const bar = document.getElementById('pending-file-bar');
        bar.classList.remove('d-none');
        bar.classList.add('d-flex');
        document.getElementById('message-input').dispatchEvent(new Event('input'));
    });
}

function setupAudioRecording() {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.onclick = toggleRecording;
}

async function toggleRecording() {
    const micBtn = document.getElementById('mic-btn');
    const icon = micBtn.querySelector('i');

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, {
                    type: 'audio/webm'
                });
                const file = new File([audioBlob], `voice-message-${Date.now()}.webm`, {
                    type: 'audio/webm'
                });

                const formData = new FormData();
                formData.append('file', file);
                console.log('Sending Voice recording:', file.name, 'size:', file.size, 'type:', file.type);

                try {
                    const res = await authenticatedFetch('/api/chat/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();

                    socket.emit('send_message', {
                        sender: myId,
                        receiver: currentFriendId,
                        content: 'Voice message',
                        fileUrl: data.fileUrl,
                        fileName: data.fileName,
                        fileType: data.fileType
                    });
                } catch (err) {
                    console.error('Recording upload failed:', err);
                    alert('Failed to send voice message: ' + err.message);
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            icon.classList.add('text-danger', 'animate-pulse');
            msgInput.placeholder = 'Recording...';
            msgInput.disabled = true;
        } catch (err) {
            console.error(err);
            alert('Could not access microphone');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        icon.classList.remove('text-danger', 'animate-pulse');
        msgInput.placeholder = 'Type a message';
        msgInput.disabled = false;
    }
}