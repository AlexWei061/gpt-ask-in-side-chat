export function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("The model endpoint must use HTTPS, except for localhost.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function permissionPattern(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.origin}/*`;
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}
