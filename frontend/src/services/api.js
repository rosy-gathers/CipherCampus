import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
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

// Handle response errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
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
};

// Post APIs
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
    getAll: () => api.get('/documents'),
    delete: (id) => api.delete(`/documents/${id}`),
    download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
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