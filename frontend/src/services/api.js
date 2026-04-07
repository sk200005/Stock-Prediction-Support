import axios from "axios";


const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
  timeout: 10000,
});


export async function getArticles() {
  const response = await apiClient.get("/articles");
  return response.data;
}


export async function getStats() {
  const response = await apiClient.get("/stats");
  return response.data;
}


export async function getCompanySignals() {
  const response = await apiClient.get("/company-signals");
  return response.data;
}


export async function getMentions() {
  const response = await apiClient.get("/mentions");
  return response.data;
}


export async function getImpactDistribution() {
  const response = await apiClient.get("/impact-distribution");
  return response.data;
}


export async function runPipeline() {
  const response = await apiClient.post("/run-pipeline", {}, { timeout: 120000 });
  return response.data;
}


export async function getMarketInsights() {
  const response = await apiClient.get("/market-insights", { timeout: 90000 });
  return response.data;
}


export async function getSentimentAnalytics() {
  const response = await apiClient.get("/sentiment-analytics", { timeout: 90000 });
  return response.data;
}
