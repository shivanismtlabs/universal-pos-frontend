/** Thermal 80mm EOD HTML for print window (kept out of .tsx to avoid JSX parse of tags). */
export function buildThermalEodHtml(opts: {
  date: string;
  bodyText: string;
}): string {
  const title = `EOD ${opts.date}`;
  const css =
    "@page{size:80mm auto;margin:4mm}" +
    "body{font-family:ui-monospace,Consolas,monospace;font-size:11px;width:72mm;margin:0 auto;color:#111}" +
    "pre{white-space:pre-wrap;word-break:break-word;margin:0}";
  const safe = opts.bodyText.split("<").join("&lt;");
  return (
    "<!DOCTYPE html><html><head><title>" +
    title +
    "</title><style>" +
    css +
    "</style></head><body><pre>" +
    safe +
    "</pre><script>window.onload=function(){window.print();}</script></body></html>"
  );
}
