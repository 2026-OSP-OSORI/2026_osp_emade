import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// 공통 CSS는 여기서 한 번만 import
import "./styles/reset.css";
import "./styles/variable.css";

import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
