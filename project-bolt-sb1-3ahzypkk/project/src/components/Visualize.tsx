import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Lock, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Shield, TrendingDown, TrendingUp, AlertTriangle, Sparkles,
  Download, RefreshCw,
} from 'lucide-react';
import { streamVisualization, getPlotUrl } from '../lib/api';
import { useSession } from '../context/SessionContext';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  purple: '#7c3aed', cyan: '#06b6d4', emerald: '#10b981',
  amber: '#f59e0b', rose: '#f43f5e', violet: '#8b5cf6',
  slate: '#64748b',
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 shadow-xl text-sm">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-bold font-mono" style={{ color: p.color || p.fill }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color = 'text-white', border = 'border-slate-800',
}: { label: string; value: string | number; sub?: string; color?: string; border?: string }) {
  return (
    <div className={`bg-slate-900/60 border ${border} rounded-2xl p-5 flex flex-col gap-1`}>
      <p className="text-slate-400 text-xs uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-3xl font-bold font-mono ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-slate-500 text-xs">{sub}</p>}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-slate-200 font-semibold text-sm tracking-widest uppercase">{title}</h3>
      <p className="text-slate-500 text-xs font-mono mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Arc gauge ────────────────────────────────────────────────────────────────
function ArcGauge({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 52, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  // Half-arc gauge (top half only) → total arc = π*r
  const arcLen = Math.PI * r;
  const filled = (pct / 100) * arcLen;
  return (
    <div className="flex flex-col items-center">
      <svg width="128" height="80" viewBox="0 0 128 80">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#1e2433" strokeWidth="10" strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLen}`}
          style={{ transition: 'stroke-dasharray 1.2s ease' }}
        />
      </svg>
      <div className="-mt-8 text-center">
        <p className="text-2xl font-bold font-mono text-white">{pct}%</p>
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// ─── AI Insight card ──────────────────────────────────────────────────────────
function InsightCard({ sessionData }: { sessionData: any }) {
  const [insight, setInsight]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(false);
  const [fetched, setFetched]     = useState(false);

  const fetchInsight = useCallback(async () => {
    if (!sessionData) return;
    setLoading(true);
    setError(false);

    const { original_rows, clean_rows, duplicates_removed, audit, filename } = sessionData;
    const dupRate  = ((duplicates_removed / original_rows) * 100).toFixed(1);
    const quality  = ((clean_rows / original_rows) * 100).toFixed(1);

    const prompt =
      `You are a financial data analyst. A reconciliation job just completed on file "${filename}". ` +
      `Stats: ${original_rows} original rows → ${clean_rows} clean rows after removing ${duplicates_removed} duplicates (${dupRate}% duplicate rate). ` +
      `Data quality score: ${quality}%. Integrity status: ${audit?.integrity_status}. ` +
      `Residual nulls: ${audit?.residual_nulls}. CompositeKey present: ${audit?.composite_key_present}. ` +
      `In 3 concise sentences, give a professional financial analyst conclusion: ` +
      `(1) what the duplicate rate tells us about the data source quality, ` +
      `(2) whether the integrity status is concerning and why, ` +
      `(3) one actionable recommendation. Be direct and specific.`;

    try {
      const res = await fetch('http://localhost:8000/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInsight(data.answer ?? '');
      setFetched(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionData]);

  useEffect(() => { fetchInsight(); }, []);

  return (
    <div className="bg-gradient-to-br from-violet-900/30 to-cyan-900/20 border border-violet-500/30 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">ZenChat AI Conclusion</h3>
          <p className="text-violet-400 text-xs">Grounded analysis of this reconciliation session</p>
        </div>
        {fetched && (
          <button onClick={fetchInsight} disabled={loading}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-slate-400 text-sm">ZenChat is analysing your results…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500/60" />
          <p className="text-slate-500 text-sm">Could not reach ZenChat.
            <button onClick={fetchInsight} className="ml-2 text-violet-400 hover:text-violet-300 underline text-xs">
              Retry
            </button>
          </p>
        </div>
      )}

      {!loading && !error && insight && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-slate-200 text-sm leading-relaxed"
        >
          {insight}
        </motion.p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Visualize() {
  const { hasSession, sessionData, backendOnline } = useSession();

  const [logs, setLogs]             = useState<string[]>([]);
  const [showLogs, setShowLogs]     = useState(false);
  const [vizRunning, setVizRunning] = useState(false);
  const [plotUrl, setPlotUrl]       = useState('');
  const [showRawPlot, setShowRawPlot] = useState(false);

  const runVizAgent = useCallback(async () => {
    setVizRunning(true);
    setLogs([]);
    try {
      for await (const event of streamVisualization()) {
        if (event.type === 'thought') setLogs(p => [...p, event.data]);
        else if (event.type === 'viz_result' && event.data.success)
          setPlotUrl(`${getPlotUrl()}?t=${Date.now()}`);
      }
    } catch (e) {
      setLogs(p => [...p, `❌ ${e}`]);
    } finally {
      setVizRunning(false);
    }
  }, []);

  useEffect(() => {
    if (hasSession) runVizAgent();
  }, [hasSession]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!backendOnline) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <span className="text-5xl">⚠️</span>
        <h2 className="text-2xl font-bold text-white mt-4 mb-2">Backend Offline</h2>
        <p className="text-slate-400">Start FastAPI at localhost:8000</p>
      </div>
    </div>
  );

  if (!hasSession || !sessionData) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-slate-600" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">No Session Data</h2>
        <p className="text-slate-400 mb-6">Reconcile a CSV on the Upload page first.</p>
        <a href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-cyan-500 text-white rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-violet-500/30">
          Go to Reconcile
        </a>
      </motion.div>
    </div>
  );

  // ── Derived values (all from sessionData — zero API calls) ─────────────────
  const {
    filename, original_rows, clean_rows, duplicates_removed, audit,
  } = sessionData;

  const retained_rows  = clean_rows;
  const quality_pct    = Math.round((clean_rows / original_rows) * 100);
  const dup_pct        = Math.round((duplicates_removed / original_rows) * 100);
  const isPASS         = audit.integrity_status === 'PASS';
  const isWARN         = audit.integrity_status === 'WARN';

  // Before / After bar data
  const beforeAfterData = [
    { label: 'Original', rows: original_rows, fill: C.slate },
    { label: 'After Clean', rows: retained_rows, fill: C.emerald },
    { label: 'Duplicates', rows: duplicates_removed, fill: C.rose },
  ];

  // Composition pie data
  const pieData = [
    { name: 'Clean Rows',  value: clean_rows,          fill: C.emerald },
    { name: 'Duplicates',  value: duplicates_removed,  fill: C.rose },
    ...(audit.residual_nulls > 0
      ? [{ name: 'Residual Nulls', value: audit.residual_nulls, fill: C.amber }]
      : []),
  ];

  // Audit checklist
  const checks = [
    { label: 'CompositeKey Generated', pass: audit.composite_key_present },
    { label: 'Residual Nulls = 0',     pass: audit.residual_nulls === 0 },
    { label: 'Integrity Status',
      pass: isPASS,
      value: audit.integrity_status,
    },
    { label: 'Deduplication Complete', pass: duplicates_removed >= 0 },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Financial Intelligence</h1>
          <p className="text-slate-400 text-sm font-mono">
            {filename}&nbsp;·&nbsp;
            {original_rows.toLocaleString()} original&nbsp;→&nbsp;
            <span className="text-emerald-400">{clean_rows.toLocaleString()} clean</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider
            ${isPASS ? 'bg-emerald-500/20 text-emerald-400' :
              isWARN ? 'bg-amber-500/20 text-amber-400' :
                       'bg-rose-500/20 text-rose-400'}`}>
            {audit.integrity_status}
          </span>
        </div>
      </div>

      {/* ── AI Conclusion ── */}
      <InsightCard sessionData={sessionData} />

      {/* ── Top Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Original Rows"      value={original_rows}      color="text-slate-200" />
        <StatCard label="Clean Rows"         value={clean_rows}         color="text-emerald-400"
          border="border-emerald-900/50" sub={`${quality_pct}% retained`} />
        <StatCard label="Duplicates Removed" value={duplicates_removed} color="text-rose-400"
          border="border-rose-900/50" sub={`${dup_pct}% of original`} />
        <StatCard label="Residual Nulls"     value={audit.residual_nulls}
          color={audit.residual_nulls === 0 ? 'text-emerald-400' : 'text-amber-400'}
          border={audit.residual_nulls === 0 ? 'border-emerald-900/50' : 'border-amber-900/50'}
          sub={audit.residual_nulls === 0 ? 'Perfect' : 'Review needed'} />
      </div>

      {/* ── Charts row 1: Gauges + Bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quality gauge card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-4">
          <SectionHead title="Data Quality Score" sub="clean_rows / original_rows" />
          <ArcGauge pct={quality_pct}
            color={quality_pct >= 80 ? C.emerald : quality_pct >= 50 ? C.amber : C.rose}
            label="Quality" />
          <p className="text-slate-400 text-xs text-center">
            {quality_pct >= 80
              ? '✅ High quality dataset — minimal duplicates'
              : quality_pct >= 50
              ? '⚠️ Moderate quality — significant duplication found'
              : '❌ Low quality — heavy deduplication required'}
          </p>
        </motion.div>

        {/* Duplicate rate gauge */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-4">
          <SectionHead title="Duplicate Rate" sub="duplicates / original_rows" />
          <ArcGauge pct={dup_pct}
            color={dup_pct <= 10 ? C.emerald : dup_pct <= 30 ? C.amber : C.rose}
            label="Dup Rate" />
          <p className="text-slate-400 text-xs text-center">
            {dup_pct <= 10
              ? '✅ Low duplicate rate — clean source data'
              : dup_pct <= 30
              ? '⚠️ Elevated duplicates — source system issues likely'
              : '❌ High duplicate rate — data pipeline review needed'}
          </p>
        </motion.div>

        {/* Before / After bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <SectionHead title="Row Breakdown" sub="absolute counts comparison" />
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={beforeAfterData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#1e2433" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="rows" radius={[6, 6, 0, 0]} animationDuration={800}
                label={{ position: 'top', fill: '#64748b', fontSize: 10,
                  formatter: (v: any) => Number(v).toLocaleString() }}>
                {beforeAfterData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* ── Charts row 2: Pie + Audit Checklist ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Data composition pie */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <SectionHead title="Data Composition" sub="proportion of clean vs duplicates vs nulls" />
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%"
                innerRadius="50%" outerRadius="75%"
                paddingAngle={3}
                animationBegin={0} animationDuration={900}
              >
                {pieData.map((d, i) => (
                  <Cell key={i} fill={d.fill} stroke="rgba(0,0,0,0.3)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => {
                  const n = Number(value) || 0;
                  return [`${n.toLocaleString()} rows (${((n / original_rows) * 100).toFixed(1)}%)`, name];
                }}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend
                formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Audit checklist */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <SectionHead title="Audit Checklist" sub="ZenVault integrity verification results" />
          <div className="space-y-3 mt-2">
            {checks.map((c, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border
                  ${c.pass
                    ? 'bg-emerald-500/5 border-emerald-900/50'
                    : 'bg-rose-500/5 border-rose-900/50'}`}>
                <div className="flex items-center gap-3">
                  {c.pass
                    ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                  <span className="text-slate-300 text-sm">{c.label}</span>
                </div>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full
                  ${c.pass
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/20 text-rose-400'}`}>
                  {c.value ?? (c.pass ? 'PASS' : 'FAIL')}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Summary sentence */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <p className="text-slate-400 text-xs leading-relaxed">
              {checks.every(c => c.pass)
                ? '🟢 All checks passed. Dataset is reconciliation-ready.'
                : checks.filter(c => !c.pass).length === 1
                ? `🟡 ${checks.filter(c => !c.pass)[0].label} requires attention before downstream use.`
                : `🔴 ${checks.filter(c => !c.pass).length} checks failed. Manual review recommended.`}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── Reduction funnel ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <SectionHead title="Reconciliation Funnel" sub="data reduction at each pipeline stage" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">

          {/* Stage 1 */}
          <div className="flex-1 text-center">
            <div className="bg-slate-800 rounded-xl p-4 mb-2">
              <p className="text-3xl font-bold font-mono text-slate-200">{original_rows.toLocaleString()}</p>
              <p className="text-slate-400 text-xs mt-1">Raw Rows Ingested</p>
            </div>
            <p className="text-slate-500 text-xs">Gate 0 — EDA Audit</p>
          </div>

          <div className="text-slate-600 text-2xl shrink-0">→</div>

          {/* Stage 2 */}
          <div className="flex-1 text-center">
            <div className="bg-slate-800 border border-amber-900/40 rounded-xl p-4 mb-2">
              <p className="text-3xl font-bold font-mono text-amber-400">
                -{duplicates_removed.toLocaleString()}
              </p>
              <p className="text-slate-400 text-xs mt-1">Duplicates Detected</p>
            </div>
            <p className="text-slate-500 text-xs">Gate 2 — CompositeKey Dedup</p>
          </div>

          <div className="text-slate-600 text-2xl shrink-0">→</div>

          {/* Stage 3 */}
          <div className="flex-1 text-center">
            <div className="bg-slate-800 border border-emerald-900/40 rounded-xl p-4 mb-2">
              <p className="text-3xl font-bold font-mono text-emerald-400">{clean_rows.toLocaleString()}</p>
              <p className="text-slate-400 text-xs mt-1">Clean Rows Output</p>
            </div>
            <p className="text-slate-500 text-xs">ZenVault — Verified</p>
          </div>

          <div className="text-slate-600 text-2xl shrink-0">→</div>

          {/* Stage 4 */}
          <div className="flex-1 text-center">
            <div className={`rounded-xl p-4 mb-2 ${isPASS ? 'bg-emerald-900/30 border border-emerald-800/50' : 'bg-amber-900/30 border border-amber-800/50'}`}>
              <p className={`text-2xl font-bold font-mono ${isPASS ? 'text-emerald-400' : 'text-amber-400'}`}>
                {audit.integrity_status}
              </p>
              <p className="text-slate-400 text-xs mt-1">Final Status</p>
            </div>
            <p className="text-slate-500 text-xs">Integrity Report</p>
          </div>
        </div>
      </motion.div>

      {/* ── Agent Log ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        <button onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${vizRunning ? 'bg-violet-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-xs font-mono text-slate-400">
              ZenView Agent Log {vizRunning ? '— running…' : `— ${logs.length} events`}
            </span>
          </div>
          {showLogs ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
        <AnimatePresence>
          {showLogs && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-slate-800">
              <div className="p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                {logs.length === 0
                  ? <p className="text-slate-600">Waiting for agent…</p>
                  : logs.map((l, i) => (
                    <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className={l.startsWith('✅') ? 'text-emerald-400' : l.startsWith('❌') ? 'text-rose-400' : l.startsWith('⚠️') ? 'text-amber-400' : 'text-slate-300'}>
                      {l}
                    </motion.p>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Raw matplotlib PNG ── */}
      <div className="bg-slate-900/40 rounded-xl border border-slate-800/60 overflow-hidden">
        <button onClick={() => setShowRawPlot(!showRawPlot)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400">🤖 Raw Agent Output (matplotlib PNG)</span>
          </div>
          {showRawPlot ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
        <AnimatePresence>
          {showRawPlot && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-slate-800/60">
              <div className="p-6 space-y-4">
                <p className="text-slate-500 text-xs font-mono">
                  Raw output from ZenView's LLM-generated matplotlib code, executed deterministically in the backend sandbox.
                </p>
                {plotUrl ? (
                  <div className="space-y-3">
                    <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                      <img src={plotUrl} alt="Raw matplotlib output" className="w-full h-auto" />
                    </div>
                    <button
                      onClick={() => { const a = document.createElement('a'); a.href = plotUrl; a.download = 'zenview-raw.png'; a.click(); }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                      <Download className="w-4 h-4" /> Download Raw PNG
                    </button>
                  </div>
                ) : (
                  <p className="text-slate-600 text-xs font-mono">
                    {vizRunning ? 'ZenView is generating the plot…' : 'No plot available yet.'}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}