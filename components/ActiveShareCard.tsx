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
  File,
  ChevronDown,
  ChevronUp,
  Clock,
  Activity,
  Share2
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
  const [statsExpanded, setStatsExpanded] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(session.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTransferring = transferState === TransferState.TRANSFERRING;

  return (
    <div className="w-full max-w-2xl bg-white rounded-[2rem] border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Banner Status */}
      <div className={`h-1.5 w-full ${isTransferring ? 'bg-brand-500' : 'bg-gray-100'}`}>
         {isTransferring && (
            <div className="h-full bg-brand-600 animate-pulse w-full"></div>
         )}
      </div>

      {/* Header */}
      <div className="p-6 md:p-8 pb-6 border-b border-gray-100 flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-center gap-4 md:gap-5 overflow-hidden">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 border border-brand-100 shadow-sm relative group">
            <div className="absolute inset-0 bg-brand-100 rounded-2xl scale-0 group-hover:scale-100 transition-transform duration-300 opacity-50"></div>
            <Layers className="w-7 h-7 md:w-8 md:h-8 relative z-10" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 truncate tracking-tight">
              {session.files.length} {session.files.length === 1 ? 'File' : 'Files'} Shared
            </h3>
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5" />
                <span>{formatBytes(session.totalSize)} total</span>
            </p>
          </div>
        </div>
        <div className="shrink-0 self-start md:self-auto">
          <CountdownTimer expiresAt={session.expiresAt} onExpire={onStopSharing} />
        </div>
      </div>

      {/* Body */}
      <div className="p-6 md:p-8 pt-6 space-y-8">
        
        {/* URL Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-600">
                <Globe className="w-4 h-4 animate-spin-slow" />
                <label className="text-xs font-bold uppercase tracking-widest">
                Public Share Link
                </label>
            </div>
            {isTransferring && (
                <span className="text-[10px] md:text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-full animate-pulse flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Sending...
                </span>
            )}
          </div>
          
          <div className="group relative">
            <div className="w-full bg-gray-50 hover:bg-white rounded-2xl border border-gray-200 hover:border-brand-200 flex flex-col md:flex-row items-center p-2 transition-all duration-300 gap-2 md:gap-0">
                <div className="flex-1 w-full px-3 py-2">
                     <div className="text-[10px] uppercase text-gray-400 font-bold mb-0.5 tracking-wider">Share URL</div>
                     <div className="font-mono text-sm text-gray-700 break-all select-all">
                        {session.shareUrl}
                     </div>
                </div>
                <button
                onClick={copyToClipboard}
                className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 ${
                    copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-900 text-white hover:bg-brand-600 hover:shadow-brand-200 hover:-translate-y-0.5'
                }`}
                >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
                </button>
            </div>
          </div>
        </div>

        {/* File List */}
        <div className="space-y-3">
             <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <File className="w-3.5 h-3.5" />
                Files in this session
             </h4>
             <div className="max-h-48 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
                {session.files.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 group hover:border-brand-100 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-gray-400 border border-gray-200 group-hover:text-brand-500 transition-colors">
                             <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400 font-medium">{formatBytes(file.size)} • {file.type || 'Unknown Type'}</p>
                        </div>
                    </div>
                ))}
             </div>
        </div>

        {/* Stats Grid - Expandable */}
        <div className="space-y-2">
            <button 
                onClick={() => setStatsExpanded(!statsExpanded)}
                className="w-full bg-white hover:bg-gray-50 rounded-2xl p-4 border border-gray-200 hover:border-brand-200 flex items-center justify-between transition-all group"
            >
                <div className="flex items-center gap-4">
                     <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-colors ${statsExpanded ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
                         <DownloadCloud className="w-6 h-6" />
                     </div>
                     <div className="text-left">
                        <span className="text-xs font-semibold text-gray-400 uppercase block tracking-wider">Total Downloads</span>
                        <span className="text-2xl font-bold text-gray-900 group-hover:text-brand-600 transition-colors">{downloadCount}</span>
                     </div>
                </div>
                <div className={`p-2 rounded-full transition-all duration-300 ${statsExpanded ? 'bg-brand-50 rotate-180 text-brand-600' : 'text-gray-400'}`}>
                     <ChevronDown className="w-5 h-5" />
                </div>
            </button>

            {/* Expanded Details */}
            <div className={`grid transition-all duration-300 ease-in-out ${statsExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
                 <div className="overflow-hidden">
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider px-2 pb-1 border-b border-gray-200 mb-2">
                            <span>File Name</span>
                            <span className="flex gap-8">
                                <span>Count</span>
                                <span>Last</span>
                            </span>
                        </div>
                        {session.files.map(file => (
                            <div key={file.id} className="flex items-center justify-between px-2 py-1">
                                <div className="flex items-center gap-2 min-w-0 flex-1 pr-4">
                                    <File className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-600 truncate">{file.name}</span>
                                </div>
                                <div className="flex items-center gap-8 shrink-0">
                                    <span className="text-sm font-bold text-gray-900 w-8 text-center bg-white rounded-md border border-gray-200">
                                        {file.downloadCount}
                                    </span>
                                    <div className="flex items-center gap-1.5 w-16 justify-end text-xs text-gray-500">
                                        <Clock className="w-3 h-3" />
                                        {file.lastDownloaded ? formatTime(file.lastDownloaded) : '-'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>
            </div>
        </div>

        {/* Info Footer */}
        <div className="flex flex-col-reverse md:flex-row items-center justify-between pt-6 border-t border-gray-50 gap-4 md:gap-0">
           <p className="text-xs text-gray-400 font-medium text-center md:text-left">
             <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
             Secure P2P Channel Active
           </p>
           <button
            onClick={onStopSharing}
            className="w-full md:w-auto text-sm font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 border border-transparent hover:border-red-100"
          >
            <Trash2 className="w-4 h-4" />
            Stop Sharing
          </button>
        </div>

      </div>
    </div>
  );
};
