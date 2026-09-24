Yes — same trick, because the problem is actually *worse* with Angular. Angular's bootstrap (loading the JS bundle, parsing it, running `bootstrapApplication`/`platformBrowserDynamic`, change detection, rendering the first component) takes noticeably longer than a plain script, so there's an even bigger window where the browser has painted `index.html` with default light CSS before your app decides what theme to use.

The fix is identical in principle: **set the theme attribute on `<html>` synchronously, before Angular even starts loading**, using a plain inline/blocking script in `index.html`. Angular components and services should *never* be the ones responsible for the first paint's theme — they're too slow for that job.

## 1. `index.html` — blocking script before everything else

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <!-- Inline, not external — avoids an extra network/file request delay -->
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>
  <link rel="stylesheet" href="styles.css">
  <base href="/">
</head>
<body>
  <app-root></app-root>
  <!-- Angular's compiled bundles get injected here by angular.json/build -->
</body>
</html>
```

Using an **inline** script (not a separate `.js` file) is preferable here since it avoids an extra request that could itself delay execution. Keep it tiny and dependency-free — no Angular, no zone.js, nothing bundled.

## 2. Don't let Angular "own" the theme on init

Your `ThemeService` should **read** the already-applied state, not decide it from scratch:

```ts
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly THEME_KEY = 'theme';
  private current: 'light' | 'dark';

  constructor(@Inject(DOCUMENT) private doc: Document) {
    // Just sync with what the blocking script already set — no flash risk here,
    // this runs after paint anyway, it's just for app state consistency.
    this.current = (this.doc.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light';
  }

  get theme() {
    return this.current;
  }

  async setTheme(theme: 'light' | 'dark') {
    this.current = theme;
    this.doc.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.THEME_KEY, theme);
    await browser.storage.local.set({ theme }); // for cross-context persistence
  }
}
```

Don't set the attribute in `AppComponent`'s `ngOnInit`, an `APP_INITIALIZER`, or a root effect — all of those run after Angular has bootstrapped and likely after first paint/first change detection cycle, which is exactly the gap you're trying to close.

## 3. CSS stays the same idea

```css
html[data-theme="light"] { --bg: #fff; --fg: #111; }
html[data-theme="dark"]  { --bg: #1e1e1e; --fg: #eee; }
body { background: var(--bg); color: var(--fg); }
```

Since Angular component styles are view-encapsulated, prefer CSS custom properties on `:root`/`html` (as above) over component-scoped classes — that way every component just inherits `var(--bg)` etc. without needing to know about themes itself.

## 4. Angular-specific gotchas to watch for

- **`NgZone` / change detection isn't needed for this** — deliberately keep the theme-init script *outside* Angular's zone entirely (it runs before Angular even loads, so this is automatic — just don't refactor it into a service later "for cleanliness").
- **Angular's build system may inline/hash your `index.html`** — if you use `angular.json`'s default `index` config, confirm the inline script survives the build (it should, Angular just injects `<script>`/`<link>` tags for bundles around your existing content, it doesn't strip inline scripts). Check the built `dist/.../index.html` to be sure.
- **CSP in Manifest V3**: Firefox extensions enforce a strict CSP that blocks inline scripts by default in MV3 for the extension pages in some configurations. If your sidebar page's CSP disallows `'unsafe-inline'`, you'll need to keep this as a small external file (`theme-init.js`, non-module, loaded with a plain `<script src="">` tag, not `type="module"`) rather than inline — same effect, just double-check your `manifest.json`'s `content_security_policy` allows it (extension page scripts are same-origin/self by default, so a local file should be fine either way — it's specifically inline `<script>` blocks with actual code in them that MV3 restricts).
- **Angular hydration/SSR**: not relevant for an extension sidebar (no SSR involved), but worth noting if you ever reuse this app shell elsewhere.

The core idea carries over 1:1 from the vanilla version: **whatever framework you use, the theme must be set by something that runs before first paint, and no JS framework's bootstrap is fast enough to be that thing.** Angular just makes the timing gap more obvious.
