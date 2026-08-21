/** Use Firefox MV2's page-context fetch so Django receives page CSRF headers. */
export function pageFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const pageContent = (globalThis as any).content;
  if (typeof pageContent?.fetch === 'function') return pageContent.fetch(input, init);
  return fetch(input, init);
}
