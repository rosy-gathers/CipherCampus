import axios from 'axios';
import { API_BASE_URL } from '../config/env';

const API_URL = API_BASE_URL.replace(/\/$/, '');

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

function isPublicAuthPath(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const pathPart = url.includes('://') ? new URL(url).pathname : url.split('?')[0];
        const path = (pathPart || '/').replace(/\/$/, '') || '/';
        return /^\/auth\/(login|register|verify-2fa|resend-otp)$/.test(path);
    } catch {
        return false;
    }
}

// Handle response errors (do not redirect on 401 during login / OTP — those are expected failures)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const reqUrl = error.config?.url || '';
        if (status === 401 && !isPublicAuthPath(reqUrl)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('sessionExpiresAt');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth APIs
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    verify2FA: (data) => api.post('/auth/verify-2fa', data),
    resendOTP: (data) => api.post('/auth/resend-otp', data),
    logout: () => api.post('/auth/logout'),
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data) => api.put('/auth/profile', data),
    resetPassword: (data) => api.put('/auth/reset-password', data),
    deleteAccount: (data) => api.delete('/auth/account', { data }),
    uploadAvatar: (file) => {
        const fd = new FormData();
        fd.append('avatar', file);
        return api.post('/auth/avatar', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    deleteAvatar: () => api.delete('/auth/avatar'),
};

// Post APIs
export const notificationAPI = {
    list: () => api.get('/notifications'),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.post('/notifications/read-all'),
};

export const postAPI = {
    create: (data) => api.post('/posts', data),
    getAll: () => api.get('/posts'),
    update: (id, data) => api.put(`/posts/${id}`, data),
    delete: (id) => api.delete(`/posts/${id}`),
};

// Message APIs
export const messageAPI = {
    send: (data) => api.post('/messages', data),
    getMessages: (userId) => api.get(`/messages/${userId}`),
    getConversations: () => api.get('/messages/conversations'),
    getAllUsers: () => api.get('/messages/users/all'),
};

// Document APIs
export const documentAPI = {
    upload: (formData) => api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getAll: (params) => api.get('/documents', { params }),
    listFolders: () => api.get('/documents/folders'),
    createFolder: (name) => api.post('/documents/folders', { name }),
    deleteFolder: (folderId) => api.delete(`/documents/folders/${folderId}`),
    moveToFolder: (documentId, folderId) =>
        api.patch(`/documents/${documentId}/folder`, { folderId }),
    delete: (id) => api.delete(`/documents/${id}`),
    download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
    share: (documentId, userId) => api.post(`/documents/${documentId}/share`, { userId }),
    revokeShare: (shareId) => api.delete(`/documents/shares/${shareId}`),
};

// Report APIs
export const reportAPI = {
    submit: (data) => api.post('/reports', data),
    getAll: () => api.get('/reports'),
    updateStatus: (id, status) => api.put(`/reports/${id}/status`, { status }),
};

// Admin APIs
export const adminAPI = {
    getAllUsers: () => api.get('/admin/users'),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
    getSystemStats: () => api.get('/admin/stats'),
    rotateKeys: (userId, data) => api.post(`/admin/rotate-keys/${userId}`, data),
    getKeyOverview: () => api.get('/keys/overview'),
};

export default api;