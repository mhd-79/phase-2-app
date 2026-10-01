export const environment = {
  production: false,
  apiUrl: (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000/api/v1'
    : 'https://harmonious-courtesy-production-5b4d.up.railway.app/api/v1'
};

