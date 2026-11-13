import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { FeedbackService } from '../shared/feedback.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const token = inject(AuthService).accessToken();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

/** Turns API failures into a readable pt-BR toast so no action ever fails silently. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const feedback = inject(FeedbackService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (req.url.startsWith(environment.apiUrl) && !req.url.endsWith('/health')) {
        if (err.status === 401 || err.status === 403) {
          feedback.error('Acesso negado', 'Entre novamente com o e-mail cadastrado.');
          void router.navigate(['/entrar']);
        } else if (err.status === 0) {
          feedback.error('Sem conexão', 'Não foi possível falar com o servidor. Tente novamente.');
        } else {
          const detail = typeof err.error?.detail === 'string' ? err.error.detail : 'A operação não foi concluída.';
          feedback.error('Algo deu errado', detail);
        }
      }
      return throwError(() => err);
    }),
  );
};
