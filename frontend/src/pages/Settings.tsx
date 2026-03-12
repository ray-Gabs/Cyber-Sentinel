/**
 * Settings — app configuration, SIEM rules management, and API key status.
 */
import { useState } from "react";
import { getCustomRules, deployRules } from "@/services/alertService";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Shield, Upload, FileText, CheckCircle } from "lucide-react";

export default function Settings() {
  const [rulesXml, setRulesXml] = useState("");
  const [loadingRules, setLoadingRules] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  const handleLoadRules = async () => {
    setLoadingRules(true);
    try {
      const xml = await getCustomRules();
      setRulesXml(typeof xml === "string" ? xml : JSON.stringify(xml, null, 2));
    } catch {
      setRulesXml("Failed to load rules. Is the backend running?");
    } finally {
      setLoadingRules(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMsg("");
    try {
      const result = await deployRules();
      setDeployMsg(result.message || "Rules deployed successfully");
    } catch {
      setDeployMsg("Failed to deploy rules. Check Wazuh connection.");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Platform info */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={20} className="text-sentinel-400" />
          <h2 className="text-lg font-semibold text-white">Platform Configuration</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-500">Platform</span>
            <span className="text-white">Cyber Sentinel v1.0.0</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-500">Backend</span>
            <span className="text-white">FastAPI + Celery + MongoDB</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-500">AI Model</span>
            <span className="text-white">Llama 3.3 70B (via Groq)</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-500">SIEM</span>
            <span className="text-white">Wazuh SIEM</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-500">Security Tools</span>
            <span className="text-white">
              Nmap, Nuclei, ZAP, SSLyze, WhatWeb, Katana
            </span>
          </div>
        </div>
      </div>

      {/* API Integrations Status */}
      <div className="card max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">API Integrations</h2>
        <p className="text-xs text-gray-500 mb-4">
          API keys are configured via environment variables on the backend (.env file).
        </p>
        <div className="space-y-2 text-sm">
          {[
            { name: "Groq API (LLM)", env: "GROQ_API_KEY" },
            { name: "Wazuh API", env: "WAZUH_API_URL" },
            { name: "NIST NVD API", env: "NVD_API_KEY" },
            { name: "VirusTotal API", env: "VIRUSTOTAL_API_KEY" },
            { name: "AbuseIPDB API", env: "ABUSEIPDB_API_KEY" },
          ].map((item) => (
            <div
              key={item.env}
              className="flex items-center justify-between py-2 border-b border-gray-800/50"
            >
              <span className="text-gray-300">{item.name}</span>
              <span className="text-xs font-mono text-gray-500">{item.env}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom SIEM Rules */}
      <div className="card max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Custom SIEM Rules</h2>
          <div className="flex gap-2">
            <button
              onClick={handleLoadRules}
              disabled={loadingRules}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {loadingRules ? (
                <LoadingSpinner size="sm" />
              ) : (
                <FileText size={14} />
              )}
              View Rules
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {deploying ? <LoadingSpinner size="sm" /> : <Upload size={14} />}
              Deploy to Wazuh
            </button>
          </div>
        </div>

        {deployMsg && (
          <div className="flex items-center gap-2 text-sm text-green-400 mb-3">
            <CheckCircle size={14} /> {deployMsg}
          </div>
        )}

        {rulesXml && (
          <pre className="text-xs text-gray-400 bg-gray-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-96">
            {rulesXml}
          </pre>
        )}
      </div>
    </div>
  );
}
