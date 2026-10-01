import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { stopBehavingLikeAWebPage } from "./nativeFeel";
import "./styles/tokens.css";
import "./styles/app.css";

stopBehavingLikeAWebPage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
