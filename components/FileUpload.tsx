import React, { useCallback, useState } from 'react';
import { UploadCloud, Loader2, FileUp, Files } from 'lucide-react';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files: File[]) => {
    setIsProcessing(true);
    // Simulate a brief processing delay for better UX
    setTimeout(() => {
      onFilesSelect(files);
      setIsProcessing(false);
    }, 800);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full max-w-2xl h-80 rounded-[2.5rem] border-2 transition-all duration-300 ease-out flex flex-col items-center justify-center p-8 group overflow-hidden
        ${isDragging 
          ? 'border-brand-500 bg-brand-50 scale-[1.02] shadow-xl shadow-brand-200' 
          : 'border-dashed border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50 hover:shadow-lg hover:shadow-gray-200'
        }
      `}
    >
      <input
        type="file"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      
      {isProcessing ? (
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div className="relative">
             <div className="absolute inset-0 bg-brand-200 rounded-full animate-ping opacity-50"></div>
             <Loader2 className="w-16 h-16 text-brand-600 animate-spin mb-4 relative z-10" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-4">Preparing Files...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-6 pointer-events-none relative z-10">
          <div className={`
             p-6 rounded-3xl transition-all duration-300
             ${isDragging ? 'bg-brand-100 text-brand-600 rotate-6 scale-110' : 'bg-gray-100 text-gray-500 group-hover:bg-brand-50 group-hover:text-brand-600'}
          `}>
            {isDragging ? <FileUp className="w-12 h-12" /> : <Files className="w-12 h-12" />}
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-brand-600 transition-colors">
              {isDragging ? 'Drop files to upload' : 'Upload files'}
            </h3>
            <p className="text-gray-500 max-w-sm font-medium">
              Drag and drop multiple files here.
              <br/>
              <span className="text-xs font-semibold text-gray-400 mt-2 block uppercase tracking-wide">Unlimited Size • Direct P2P</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
