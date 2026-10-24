import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { AppProvider } from "./state";
import { Layout } from "./components/Layout";
import { QueryDrawerProvider } from "./components/QueryDrawer";
import { Overview } from "./pages/Overview";
import { Analysis } from "./pages/Analysis";
import { Competitors } from "./pages/Competitors";
import { Opportunities } from "./pages/Opportunities";
import { Queries } from "./pages/Queries";
import { Experiments } from "./pages/Experiments";
import { Insights } from "./pages/Insights";
import { Citations } from "./pages/Citations";
import { ContentGaps } from "./pages/ContentGaps";
import { Reports } from "./pages/Reports";
import { Monitoring } from "./pages/Monitoring";
import { AuthGate } from "./auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <AppProvider>
          <QueryDrawerProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="analysis" element={<Analysis />} />
                <Route path="competitors" element={<Competitors />} />
                <Route path="opportunities" element={<Opportunities />} />
                <Route path="queries" element={<Queries />} />
                <Route path="experiments" element={<Experiments />} />
                <Route path="insights" element={<Insights />} />
                <Route path="citations" element={<Citations />} />
                <Route path="gaps" element={<ContentGaps />} />
                <Route path="monitoring" element={<Monitoring />} />
                <Route path="reports" element={<Reports />} />
                <Route path="*" element={<Overview />} />
              </Route>
            </Routes>
          </QueryDrawerProvider>
        </AppProvider>
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
