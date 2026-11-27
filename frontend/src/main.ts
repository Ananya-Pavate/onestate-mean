import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AppComponent } from './app/app.component';
// Adds the login token to every request; if the session has expired (401), send the user back to the login page.
const authInterceptor = (req: any, next: any) => {
  const t = localStorage.getItem('osmw_token');
  return next(t ? req.clone({ setHeaders: { Authorization: 'Bearer ' + t } }) : req).pipe(
    catchError((e: any) => {
      if (e.status === 401 && t && !req.url.includes('/auth/')) {
        localStorage.removeItem('osmw_token'); localStorage.removeItem('osmw_role');
        alert('Your session expired. Please log in again.'); location.reload();
      }
      return throwError(() => e);
    }));
};
bootstrapApplication(AppComponent, { providers: [provideHttpClient(withInterceptors([authInterceptor]))] });
