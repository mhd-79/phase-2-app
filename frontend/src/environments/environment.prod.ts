export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000/api/v1'
    : 'https://okuto-billing-production.up.railway.app/api/v1'
};

