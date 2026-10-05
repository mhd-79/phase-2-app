export const environment = {
  production: false,
  /** OKUTO IQ chatbot (Phase 2 admin). Set to false to remove the floating button entirely. */
  aiChatbotEnabled: true,
  apiUrl: (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000/api/v1'
    : 'https://okuto-billing-production.up.railway.app/api/v1'
};

