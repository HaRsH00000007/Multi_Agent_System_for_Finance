import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TerminalProps {
  logs: string[];
  title?: string;
}

export default function Terminal({ logs, title = 'Pipeline Log' }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogStyle = (log: string) => {
    if (log.includes('✅')) return 'text-green-400';
    if (log.includes('❌')) return 'text-red-400';
    if (log.includes('⚙️')) return 'text-blue-400';
    if (log.includes('⚠️')) return 'text-yellow-400';
    if (log.includes('📊')) return 'text-purple-400';
    if (log.includes('🔍')) return 'text-cyan-400';
    return 'text-slate-300';
  };

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-sm font-mono text-slate-400 ml-3">{title}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <span className="text-xs text-slate-500">LIVE</span>
        </div>
      </div>

      <div className="p-4 h-96 overflow-y-auto font-mono text-sm scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">Waiting for pipeline to start...</div>
        ) : (
          <>
            {logs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className={`mb-1 ${getLogStyle(log)}`}
              >
                <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                {log}
              </motion.div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
