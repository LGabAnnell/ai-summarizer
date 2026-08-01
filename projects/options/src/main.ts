import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';

// Set up webextension polyfill as global
import 'webextension-polyfill';

bootstrapApplication(AppComponent, {
  providers: [
    // Add any providers here if needed
  ]
}).catch(err => console.error(err));
