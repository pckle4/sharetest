import React, { useState } from 'react';
import { SharedSession, TransferState } from '../types';
import { CountdownTimer } from './CountdownTimer';
import { 
  FileText, 
  Trash2, 
  Copy, 
  Check, 
  Globe,
  HardDrive,
  DownloadCloud,
  Layers,
  File
} from 'lucide-react';

interface ActiveShareCardProps {
  session: SharedSession;
  onStopSharing: () => void;
  transferState?: TransferState;
  downloadCount: number;
}

export const ActiveShareCard: React.FC<ActiveShareCardProps> = ({ 
    session, 
    onStopSharing,
    transferState = TransferState.IDLE,
    downloadCount = 0
}) => {
  const [copied, setCopied] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(session.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTransferring = transferState === TransferState.TRANSFERRING;

  return (
    <div className="w-full max-w-2xl bg-white rounded-3xl border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Banner Status */}
      <div className={`h-1.5 w-full ${isTransferring ? 'bg-brand-500' : 'bg-gray-100'}`}>
         {isTransferring && (
            <div className="h-full bg-brand-600 animate-pulse w-full"></div>
         )}
      </div>

      {/* Header */}
      <div className="p-8 pb-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-5 overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 border border-brand-100 shadow-sm">
            <Layers className="w-8 h-8" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-xl font-bold text-gray-900 truncate tracking-tight">
              {session.files.length} {session.files.length === 1 ? 'File' : 'Files'} Shared
            </h3>
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <HardDrive className="w-3 h-3" />
                Total Size: {formatBytes(session.totalSize)}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <CountdownTimer expiresAt={session.expiresAt} onExpire={onStopSharing} />
        </div>
      </div>

      {/* Body */}
      <div className="p-8 pt-6 space-y-8">
        
        {/* URL Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-600">
                <Globe className="w-4 h-4 animate-spin-slow" />
                <label className="text-xs font-bold uppercase tracking-widest">
                Share Link
                </label>
            </div>
            {isTransferring && (
                <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-md animate-pulse">
                    Peer Downloading...
                </span>
            )}
          </div>
          
          <div className="group relative">
            <div className="w-full bg-gray-50 hover:bg-white rounded-2xl border border-gray-200 hover:border-brand-200 flex items-center p-2 pr-2 transition-all duration-300">
                <div className="flex-1 px-4 py-2 font-mono text-sm text-gray-600 truncate select-all">
                    {session.shareUrl}
                </div>
                <button
                onClick={copyToClipboard}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm ${
                    copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-900 text-white hover:bg-brand-600 hover:shadow-brand-200'
                }`}
                >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
          </div>
        </div>

        {/* File List */}
        <div className="space-y-3">
             <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Files in this session</h4>
             <div className="max-h-48 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
                {session.files.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-400 border border-gray-200">
                             <File className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                        </div>
                    </div>
                ))}
             </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4">
             {/* Stat 1: Downloads */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center justify-between transition-all hover:bg-brand-50/50 hover:border-brand-100">
                <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-400 shadow-sm">
                         <DownloadCloud className="w-5 h-5" />
                     </div>
                     <div>
                        <span className="text-xs font-semibold text-gray-400 uppercase block">Total Downloads</span>
                        <span className="text-xl font-bold text-gray-900">{downloadCount}</span>
                     </div>
                </div>
                <div className="text-right">
                     <div className={`text-xs px-2 py-1 rounded-full font-bold ${isTransferring ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                         {isTransferring ? 'Active' : 'Idle'}
                     </div>
                </div>
            </div>
        </div>

        {/* Info Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
           <p className="text-xs text-gray-400 font-medium max-w-[60%]">
             Keep this tab open. Peer-to-peer connection active.
           </p>
           <button
            onClick={onStopSharing}
            className="text-sm font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Stop Sharing
          </button>
        </div>

      </div>
    </div>
  );
};
