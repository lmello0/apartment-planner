import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners, provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { environment } from '../environments/environment';
import { ApiService } from './core/api.service';
import { HttpApiService } from './core/http-api.service';
import { authInterceptor, errorInterceptor } from './core/http.interceptors';
import { MockApiService } from './core/mock-api.service';
import { routes } from './app.routes';
import { AppPreset, PT_BR } from './primeng-config';

registerLocaleData(localePt, 'pt-BR');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: AppPreset, options: { darkModeSelector: '[data-theme="dark"]', cssLayer: false } },
      translation: PT_BR,
    }),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: ApiService, useClass: environment.useMock ? MockApiService : HttpApiService },
    MessageService,
    ConfirmationService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !environment.useMock,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
