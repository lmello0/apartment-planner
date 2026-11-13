import { EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  function setup(authenticated: boolean) {
    // ready resolves asynchronously, like a real Supabase session restore.
    const fake = { ready: new Promise<void>((r) => setTimeout(r)), isAuthenticated: signal(authenticated) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: fake }] });
    return () =>
      runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ) as Promise<boolean | UrlTree>;
  }

  it('redirects to /entrar after the session restore when logged out', async () => {
    const result = await setup(false)();
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/entrar');
  });

  it('allows navigation when logged in', async () => {
    expect(await setup(true)()).toBeTrue();
  });
});
