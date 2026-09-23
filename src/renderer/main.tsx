import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// #566: KaTeX's own stylesheet (math glyph layout + @font-face for its math
// fonts). Loaded globally, matching styles.css, since KaTeX rendering itself
// (unlike #564's Mermaid) is synchronous and always compiled into this
// bundle — see markdownPreviewRenderer.ts's KaTeX setup comment.
import "katex/dist/katex.min.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
