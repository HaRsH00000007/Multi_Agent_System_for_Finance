import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, File, X } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

export default function FileUpload({ onFileSelect, selectedFile, onClear }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.csv')) {
          onFileSelect(file);
        }
        e.dataTransfer.clearData();
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.name.endsWith('.csv')) {
          onFileSelect(file);
        }
      }
    },
    [onFileSelect]
  );

  if (selectedFile) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border-2 border-cyan-500/30 rounded-xl p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <File className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">{selectedFile.name}</h3>
              <p className="text-sm text-slate-400">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-300 ${
        isDragging
          ? 'border-cyan-500 bg-cyan-500/10 scale-105'
          : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
      }`}
    >
      <input
        type="file"
        accept=".csv"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center space-y-4">
        <motion.div
          animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
          className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/50"
        >
          <Upload className="w-10 h-10 text-white" />
        </motion.div>

        <div className="text-center">
          <h3 className="text-xl font-semibold text-white mb-2">
            {isDragging ? 'Drop your CSV file here' : 'Upload CSV File'}
          </h3>
          <p className="text-slate-400">
            Drag and drop or click to browse
          </p>
        </div>

        <div className="px-4 py-2 bg-slate-800/50 rounded-lg">
          <p className="text-xs text-slate-500">Accepts .csv files only</p>
        </div>
      </div>
    </motion.div>
  );
}
