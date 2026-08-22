import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';

// Set up webextension polyfill as global
import 'webextension-polyfill';
import {provideZonelessChangeDetection} from "@angular/core";

bootstrapApplication(AppComponent, {
  providers: [
    // Add any providers here if needed
    provideZonelessChangeDetection()
  ]
}).catch(err => console.error(err));
