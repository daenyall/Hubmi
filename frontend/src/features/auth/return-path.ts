/** Kierujemy wyłącznie do znanych stron aplikacji. */
export function safeReturnPath(value?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/moje-zgloszenia";
  try {
    const url = new URL(value, "https://hubmi.invalid");
    if (url.origin !== "https://hubmi.invalid") return "/moje-zgloszenia";
    if (!["/", "/kreator", "/moje-zgloszenia", "/rops"].includes(url.pathname) &&
        !/^\/(?:moje-zgloszenia|rops\/zgloszenia)\/[0-9a-f-]{36}$/i.test(url.pathname)) return "/moje-zgloszenia";
    return url.pathname + url.search;
  } catch { return "/moje-zgloszenia"; }
}
