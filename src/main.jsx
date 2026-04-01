import React from "react";
import ReactDOM from "react-dom/client";
import LandingPage from "./pages/LandingPage";
import "./index.css";

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

document.body.dataset.shell = isTauriRuntime ? "tauri" : "web";

if (!isTauriRuntime) {
  document.title = "DevStack | Windows local development environment";
}

const root = ReactDOM.createRoot(document.getElementById("root"));

async function bootstrap() {
  const RootComponent = isTauriRuntime
    ? (await import("./App")).default
    : LandingPage;

  root.render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>,
  );
}

bootstrap();
