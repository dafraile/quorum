import React from "react";
import ReactDOM from "react-dom/client";

// The study instance (/study) and the workbench (/) load separately so the study
// bundle and stylesheet stay independent of the workbench.
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
} else {
  void Promise.all([import("./App"), import("./styles.css")]).then(([{ default: App }]) =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
}
