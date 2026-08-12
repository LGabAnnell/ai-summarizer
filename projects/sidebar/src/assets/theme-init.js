(function () {
  try {
    var theme = localStorage.getItem('ai-summarizer-theme') || 'light';
    var html = document.documentElement;
    html.classList.remove('dark-theme', 'light-theme');
    html.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
    html.setAttribute('data-theme', theme);
  } catch (e) {
    // localStorage might be unavailable in some contexts, fail safe to light
  }
})();
