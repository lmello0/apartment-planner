import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.ready;
  return auth.isAuthenticated() ? true : inject(Router).createUrlTree(['/entrar']);
};
