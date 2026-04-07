import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Companies from "./pages/Companies";
import Dashboard from "./pages/Dashboard";
import MarketInsights from "./pages/MarketInsights";
import SentimentAnalytics from "./pages/SentimentAnalytics";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/market-insights" element={<MarketInsights />} />
          <Route path="/sentiment-analytics" element={<SentimentAnalytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
