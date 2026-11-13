import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  // inject() only works synchronously in the injection context: resolve everything before any await.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isAuthenticated() ? true : router.createUrlTree(['/entrar']);
};
