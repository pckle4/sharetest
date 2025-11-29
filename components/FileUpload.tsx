import React, { useCallback, useState } from 'react';
import { UploadCloud, Loader2, FileUp, Files, Plus } from 'lucide-react';

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
        relative w-full max-w-2xl h-64 md:h-80 rounded-[2rem] md:rounded-[2.5rem] border-2 transition-all duration-300 ease-out flex flex-col items-center justify-center p-6 md:p-8 group overflow-hidden cursor-pointer bg-white mx-4
        ${isDragging 
          ? 'border-brand-500 bg-brand-50 scale-[1.02] shadow-xl shadow-brand-200' 
          : 'border-dashed border-gray-300 hover:border-brand-400 hover:bg-gray-50 hover:shadow-xl hover:shadow-gray-200/50'
        }
      `}
    >
      <input
        type="file"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
      />
      
      {isProcessing ? (
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div className="relative">
             <div className="absolute inset-0 bg-brand-200 rounded-full animate-ping opacity-50"></div>
             <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-brand-600 animate-spin mb-4 relative z-10" />
          </div>
          <p className="text-lg md:text-xl font-bold text-gray-900 mt-4">Preparing Files...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-4 md:space-y-6 pointer-events-none relative z-10">
          <div className={`
             p-4 md:p-6 rounded-3xl transition-all duration-500
             ${isDragging ? 'bg-brand-100 text-brand-600 rotate-6 scale-110' : 'bg-gray-50 text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 group-hover:-translate-y-2'}
          `}>
            {isDragging ? <FileUp className="w-10 h-10 md:w-12 md:h-12" /> : <Files className="w-10 h-10 md:w-12 md:h-12" />}
          </div>
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 group-hover:text-brand-600 transition-colors">
              {isDragging ? 'Drop files to upload' : 'Select or Drop Files'}
            </h3>
            <p className="text-gray-500 max-w-xs md:max-w-sm font-medium text-sm md:text-base px-2">
              Select multiple files to start sharing.
              <br/>
              <span className="text-xs font-semibold text-gray-400 mt-3 flex items-center justify-center gap-2 uppercase tracking-wide">
                <Plus className="w-3 h-3" /> Add Unlimited Files
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
