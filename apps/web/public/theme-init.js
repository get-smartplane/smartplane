// Applies the saved theme before first paint to avoid a light flash in dark mode. A file, not an inline
// script, so the Content-Security-Policy (public/_headers) can refuse every inline script.
try {
  var t = localStorage.getItem("pc-theme") || "system";
  if (t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches))
    document.documentElement.classList.add("dark");
} catch (e) {}
