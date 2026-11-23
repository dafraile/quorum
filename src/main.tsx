import React from "react";
import ReactDOM from "react-dom/client";

// Four separate bundles: the GP study (/study), its researcher console (/study/admin), the
// original hackathon workbench (/workbench), and the Quorum demo (everything else: the landing
// page, Clinical training and consultation, Thinking).
const root = ReactDOM.createRoot(document.getElementById("root")!);
const path = window.location.pathname;

if (path.startsWith("/study/admin")) {
  void import("./study/Admin").then(({ StudyAdmin }) =>
    root.render(
      <React.StrictMode>
        <StudyAdmin />
      </React.StrictMode>,
    ),
  );
} else if (path.startsWith("/study")) {
  void import("./study/StudyApp").then(({ StudyApp }) =>
    root.render(
      <React.StrictMode>
        <StudyApp />
      </React.StrictMode>,
    ),
  );
} else if (path.startsWith("/workbench")) {
  void Promise.all([import("./App"), import("./styles.css")]).then(([{ default: App }]) =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
} else {
  void import("./quorum/QuorumApp").then(({ QuorumApp }) =>
    root.render(
      <React.StrictMode>
        <QuorumApp />
      </React.StrictMode>,
    ),
  );
}
