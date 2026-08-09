import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('farm2door_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('farm2door_token');
      localStorage.removeItem('farm2door_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============ Auth API ============
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/update-profile', data),
  updatePassword: (data) => api.put('/auth/update-password', data),
  verifyOTP: (data) => api.post('/auth/verify-otp', data),
  resendOTP: (data) => api.post('/auth/resend-otp', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (token, data) => api.post(`/auth/reset-password/${token}`, data),
};

// ============ Product API ============
export const productAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getFeatured: () => api.get('/products/featured'),
  getCategories: () => api.get('/products/categories'),
  getNearby: (params) => api.get('/products/nearby', { params }),
  create: (data) => api.post('/products', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, data) => api.put(`/products/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id) => api.delete(`/products/${id}`),
};

// ============ Farmer API ============
export const farmerAPI = {
  getAll: (params) => api.get('/farmers', { params }),
  getById: (id) => api.get(`/farmers/${id}`),
  getNearby: (params) => api.get('/farmers/nearby', { params }),
  getFeatured: () => api.get('/farmers/featured'),
  getProducts: (id, params) => api.get(`/farmers/${id}/products`, { params }),
  updateProfile: (data) => api.put('/farmers/profile', data),
  getDashboard: () => api.get('/farmers/me/dashboard'),
  getAnalytics: (params) => api.get('/farmers/me/analytics', { params }),
};

// ============ Order API ============
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, data) => api.put(`/orders/${id}/status`, data),
  cancel: (id, data) => api.put(`/orders/${id}/cancel`, data),
};

// ============ Payment API ============
export const paymentAPI = {
  createOrder: (data) => api.post('/payments/create-order', data),
  verify: (data) => api.post('/payments/verify', data),
  history: () => api.get('/payments/history'),
};

// ============ Cart API ============
export const cartAPI = {
  get: () => api.get('/cart'),
  add: (data) => api.post('/cart', data),
  update: (productId, data) => api.put(`/cart/${productId}`, data),
  remove: (productId) => api.delete(`/cart/${productId}`),
  clear: () => api.delete('/cart'),
};

// ============ Wishlist API ============
export const wishlistAPI = {
  get: () => api.get('/wishlist'),
  add: (productId) => api.post(`/wishlist/${productId}`),
  remove: (productId) => api.delete(`/wishlist/${productId}`),
  check: (productId) => api.get(`/wishlist/check/${productId}`),
  clear: () => api.delete('/wishlist'),
};

// ============ Address API ============
export const addressAPI = {
  getAll: () => api.get('/addresses'),
  getById: (id) => api.get(`/addresses/${id}`),
  create: (data) => api.post('/addresses', data),
  update: (id, data) => api.put(`/addresses/${id}`, data),
  delete: (id) => api.delete(`/addresses/${id}`),
  setDefault: (id) => api.put(`/addresses/${id}/default`),
};

// ============ Review API ============
export const reviewAPI = {
  getProductReviews: (productId, params) => api.get(`/reviews/product/${productId}`, { params }),
  getFarmerReviews: (farmerId, params) => api.get(`/reviews/farmer/${farmerId}`, { params }),
  getMyReviews: (params) => api.get('/reviews/my-reviews', { params }),
  create: (data) => api.post('/reviews', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, data) => api.put(`/reviews/${id}`, data),
  delete: (id) => api.delete(`/reviews/${id}`),
  markHelpful: (id) => api.put(`/reviews/${id}/helpful`),
  respond: (id, data) => api.put(`/reviews/${id}/respond`, data),
};

// ============ Notification API ============
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  clear: () => api.delete('/notifications/clear'),
};

// ============ Delivery API ============
export const deliveryAPI = {
  getDashboard: () => api.get('/delivery/dashboard'),
  getAssignments: (params) => api.get('/delivery/assignments', { params }),
  getHistory: (params) => api.get('/delivery/history', { params }),
  getEarnings: () => api.get('/delivery/earnings'),
  updateStatus: (id, data) => api.put(`/delivery/orders/${id}/status`, data),
  updateLocation: (data) => api.put('/delivery/location', data),
  toggleAvailability: () => api.put('/delivery/availability'),
  updateProfile: (data) => api.put('/delivery/profile', data),
  assign: (orderId, data) => api.put(`/delivery/assign/${orderId}`, data),
  getAvailableOrders: (params) => api.get('/delivery/available-orders', { params }),
  acceptOrder: (id) => api.put(`/delivery/orders/${id}/accept`),
};

// ============ Admin API ============
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getAnalytics: () => api.get('/admin/analytics'),
  getUsers: (params) => api.get('/admin/users', { params }),
  toggleUserStatus: (id) => api.put(`/admin/users/${id}/suspend`),
  getPendingFarmers: () => api.get('/admin/farmers/pending'),
  approveFarmer: (id, data) => api.put(`/admin/farmers/${id}/approve`, data),
  toggleFeatured: (id) => api.put(`/admin/farmers/${id}/feature`),
  getComplaints: (params) => api.get('/admin/complaints', { params }),
  resolveComplaint: (id, data) => api.put(`/admin/complaints/${id}/resolve`, data),
};

// ============ Complaint API ============
export const complaintAPI = {
  create: (data) => api.post('/complaints', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll: (params) => api.get('/complaints', { params }),
  getById: (id) => api.get(`/complaints/${id}`),
  addMessage: (id, data) => api.post(`/complaints/${id}/messages`, data),
};

// ============ Face Auth API ============
export const faceAPI = {
  enroll: (data) => api.post('/face/enroll', data),
  verify: (data) => api.post('/face/verify', data),
  unenroll: () => api.delete('/face/enroll'),
  getStatus: () => api.get('/face/status'),
};

export default api;
