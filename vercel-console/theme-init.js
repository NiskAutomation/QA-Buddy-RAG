try {
  const saved = localStorage.getItem('quality-forge-theme');
  const preferred = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : preferred;
} catch {
  document.documentElement.dataset.theme = 'dark';
}
