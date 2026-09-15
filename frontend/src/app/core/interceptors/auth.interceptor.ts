import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('pos_token');
  const role = localStorage.getItem('pos_role');
  const user = localStorage.getItem('pos_active_user');
  let username = '';
  if (user) {
    try {
      const parsed = JSON.parse(user);
      username = parsed.username || '';
    } catch {}
  }

  let headers = req.headers;
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  if (role) {
    headers = headers.set('X-User-Role', role);
  }
  if (username) {
    headers = headers.set('X-Username', username);
  }

  return next(req.clone({ headers }));
};
