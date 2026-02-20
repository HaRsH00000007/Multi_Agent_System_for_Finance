import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCircle2, ArrowRight, Shield, Zap } from 'lucide-react';
import FileUpload from './FileUpload';
import Terminal from './Terminal';
import { streamReconciliation } from '../lib/api';
import { useSession } from '../context/SessionContext';
import type { ReconciliationSummary } from '../lib/types';

export default function UploadReconcile() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const { setSessionData, backendOnline } = useSession();
  const navigate = useNavigate();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setLogs([]);
    setSummary(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setLogs([]);
    setSummary(null);
  };

  const handleReconcile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setLogs([]);
    setSummary(null);

    try {
      for await (const event of streamReconciliation(selectedFile)) {
        if (event.type === 'thought') {
          setLogs((prev) => [...prev, event.data]);
        } else if (event.type === 'summary') {
          setSummary(event.data);
          setSessionData(event.data);
        }
      }
    } catch (error) {
      setLogs((prev) => [...prev, `❌ Error: ${error}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const agents = [
    {
      name: 'ZenRecon',
      role: 'Data Analyst',
      description: 'Cleans dirty CSV data through a 3-gate ML pipeline with EDA audit, LLM-generated Pandas code, and deduplication.',
      icon: Bot,
      color: 'from-cyan-500 to-blue-600',
    },
    {
      name: 'ZenVault',
      role: 'Auditor',
      description: 'Validates data integrity, checks for residual nulls, and produces comprehensive audit reports.',
      icon: Shield,
      color: 'from-green-500 to-emerald-600',
    },
    {
      name: 'ZenForce',
      role: 'Orchestrator',
      description: 'Coordinates the entire workforce, manages agent communication, and ensures deterministic execution.',
      icon: Zap,
      color: 'from-orange-500 to-red-600',
    },
  ];

  if (!backendOnline) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Backend Offline</h2>
          <p className="text-slate-400 mb-4">
            Start the FastAPI server at localhost:8000 to continue.
          </p>
          <code className="text-sm bg-slate-900 px-4 py-2 rounded-lg text-cyan-400">
            python main.py
          </code>
        </div>
      </div>
    );
  }

  if (!selectedFile && !summary) {
    return (
      <div className="space-y-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Deterministic AI Workforce
          </h1>
          <p className="text-xl text-slate-300 mb-2">
            Financial data reconciliation powered by coordinated AI agents
          </p>
          <p className="text-slate-400">
            No guessing. No hallucinations. Pure Python execution.
          </p>
        </motion.div>

        <FileUpload
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          onClear={handleClearFile}
        />

        <div className="grid md:grid-cols-3 gap-6">
          {agents.map((agent, index) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all"
            >
              <div
                className={`w-12 h-12 bg-gradient-to-br ${agent.color} rounded-lg flex items-center justify-center mb-4 shadow-lg`}
              >
                <agent.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">{agent.name}</h3>
              <p className="text-sm text-cyan-400 mb-3">{agent.role}</p>
              <p className="text-sm text-slate-400 leading-relaxed">{agent.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Data Reconciliation</h1>
          {selectedFile && (
            <p className="text-slate-400">Processing: {selectedFile.name}</p>
          )}
        </div>

        {!summary && selectedFile && (
          <button
            onClick={handleReconcile}
            disabled={isProcessing}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isProcessing ? 'Processing...' : 'Run Reconciliation'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {selectedFile && !summary && (
        <FileUpload
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          onClear={handleClearFile}
        />
      )}

      {(isProcessing || logs.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Terminal logs={logs} title="ZenForce Pipeline" />

          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Pipeline Status</h3>
              <div className="space-y-3">
                {logs.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-3"
                  >
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                    <span className="text-slate-300">Pipeline active</span>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <div>
                <h3 className="text-xl font-semibold text-white">Reconciliation Complete</h3>
                <p className="text-green-400">Session ID: {summary.session_id}</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm text-slate-400 mb-1">Original Rows</p>
              <p className="text-3xl font-bold text-white">{summary.original_rows}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm text-slate-400 mb-1">Clean Rows</p>
              <p className="text-3xl font-bold text-cyan-400">{summary.clean_rows}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm text-slate-400 mb-1">Duplicates Removed</p>
              <p className="text-3xl font-bold text-orange-400">{summary.duplicates_removed}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm text-slate-400 mb-1">Integrity Status</p>
              <p
                className={`text-2xl font-bold ${
                  summary.audit.integrity_status === 'PASS'
                    ? 'text-green-400'
                    : summary.audit.integrity_status === 'WARN'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}
              >
                {summary.audit.integrity_status}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Audit Report</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300">Residual Nulls</span>
                <span className="text-white font-medium">{summary.audit.residual_nulls}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300">CompositeKey Present</span>
                <span className={summary.audit.composite_key_present ? 'text-green-400' : 'text-red-400'}>
                  {summary.audit.composite_key_present ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => navigate('/visualize')}
              className="flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            >
              <span>Go to Charts</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
