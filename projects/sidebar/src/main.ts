import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideRouter} from '@angular/router';

// Set up webextension polyfill as global for sidebar context
import 'webextension-polyfill';
import {provideZonelessChangeDetection} from "@angular/core";

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([]),
    provideZonelessChangeDetection()
  ]
}).catch(err => console.error(err));