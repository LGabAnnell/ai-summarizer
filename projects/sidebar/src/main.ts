import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';

// Set up webextension polyfill as global for sidebar context
import 'webextension-polyfill';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([])
  ]
}).catch(err => console.error(err));