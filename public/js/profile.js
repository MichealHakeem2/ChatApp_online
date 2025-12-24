const token = localStorage.getItem('accessToken');
if (!token) window.location.href = 'index.html';

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
    return response;
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

document.addEventListener('DOMContentLoaded', async () => {
    await loadProfile();
    setupUploads();
});

async function loadProfile() {
    try {
        const res = await authenticatedFetch('/api/users/me');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('display-username').innerText = data.username;
        document.getElementById('display-email').innerText = data.email;
        document.getElementById('profile-display-pic').src = data.profilePic || '/images/default-profile.png';
    } catch (err) {
        console.error(err);
    }
}

function setupUploads() {
    document.getElementById('profile-pic-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await authenticatedFetch('/api/users/upload/profile', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                document.getElementById('profile-display-pic').src = data.profilePic;
                alert('Profile picture updated!');
            } else {
                alert(data.error || 'Upload failed');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    });

    document.getElementById('wallpaper-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await authenticatedFetch('/api/users/upload/wallpaper', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                alert('Chat wallpaper updated!');
            } else {
                alert(data.error || 'Upload failed');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    });
}

function editField(field) {
    const modal = document.getElementById('edit-modal');
    const input = document.getElementById('modal-input');
    const title = document.getElementById('modal-title');

    title.innerText = `Edit ${field}`;
    input.value = document.getElementById(`display-${field}`).innerText;
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveField() {
    // Currently, backend doesn't support updating username directly in this session's scope 
    // but we can add the placeholder logic or alert that it's coming soon.
    alert('Username editing coming soon!');
    closeModal();
}
Header