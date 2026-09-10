import { parse, type DefaultTreeAdapterMap } from "parse5";
import { sanitizeText } from "../local.js";
import type { RemotePageMetadata } from "../types.js";

type Node = DefaultTreeAdapterMap["node"];
/** No scripts, subresources, external entities, browser, or DOM execution. */
export function extractPageMetadata(html: string, baseUrl: string): RemotePageMetadata {
  if (Buffer.byteLength(html, "utf8") > 1_048_576) throw new Error("html_size_limit");
  const document = parse(html);
  const page: RemotePageMetadata = { title: "", description: "", visibleTextSample: "", formCount: 0, passwordInput: false, externalFormActions: [], iframeCount: 0, scriptSourceDomains: [], linkTargetDomains: [] };
  const baseHost = new URL(baseUrl).hostname;
  const hostname = (value?: string): string | undefined => {
    try { const url = new URL(value ?? "", baseUrl); return ["http:", "https:"].includes(url.protocol) ? url.hostname : undefined; } catch { return undefined; }
  };
  const push = (values: string[], value?: string) => { if (value && values.length < 64 && !values.includes(value)) values.push(value); };
  const pending: Array<{ node: Node; hidden: boolean; title: boolean }> = [{ node: document, hidden: false, title: false }];
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++visited > 50_000) throw new Error("html_node_limit");
    const node = item.node;
    if (node.nodeName === "#text" && "value" in node) {
      if (item.title) page.title += node.value.slice(0, Math.max(0, 512 - page.title.length));
      if (!item.hidden && page.visibleTextSample.length < 20_000) page.visibleTextSample += `${node.value} `.slice(0, 20_000 - page.visibleTextSample.length);
    }
    let hidden = item.hidden; let title = item.title;
    if ("tagName" in node) {
      const tag = node.tagName;
      const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]));
      if (tag === "html") page.language = sanitizeText(attrs.lang ?? "", 80);
      if (tag === "meta" && attrs.name?.toLowerCase() === "description") page.description = sanitizeText(attrs.content ?? "", 512);
      if (tag === "link") {
        if (attrs.rel?.split(/\s+/).includes("canonical")) page.canonicalHostname = hostname(attrs.href);
        if (attrs.rel?.split(/\s+/).includes("icon")) page.faviconHostname = hostname(attrs.href);
      }
      if (tag === "form") { page.formCount++; const action = hostname(attrs.action); if (action !== baseHost) push(page.externalFormActions, action); }
      if (tag === "input" && attrs.type?.toLowerCase() === "password") page.passwordInput = true;
      if (tag === "iframe") page.iframeCount++;
      if (tag === "script" && attrs.src) push(page.scriptSourceDomains, hostname(attrs.src));
      if (tag === "a" && attrs.href) push(page.linkTargetDomains, hostname(attrs.href));
      hidden ||= ["script", "style", "template", "noscript", "head", "svg"].includes(tag) || "hidden" in attrs || attrs["aria-hidden"] === "true";
      title ||= tag === "title";
    }
    if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push({ node: node.childNodes[index], hidden, title });
  }
  page.title = sanitizeText(page.title.replace(/\s+/g, " ").trim(), 512);
  page.visibleTextSample = sanitizeText(page.visibleTextSample.replace(/\s+/g, " ").trim());
  const queryValues = [...new URL(baseUrl).searchParams.values()].filter(Boolean);
  const redactEchoes = (value: string) => queryValues.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  page.title = redactEchoes(page.title).slice(0, 512);
  page.description = redactEchoes(page.description).slice(0, 512);
  page.visibleTextSample = redactEchoes(page.visibleTextSample).slice(0, 20_000);
  return page;
}
