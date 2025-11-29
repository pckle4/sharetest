import React, { useState, useEffect, useRef } from 'react';
import { SharedSession, SharedFileEntry, TransferState, FileProgress, FileDownloadStatus } from './types';
import { FileUpload } from './components/FileUpload';
import { ActiveShareCard } from './components/ActiveShareCard';
import { Zap, Shield, Network, Loader2, Download, Share2, AlertCircle, RefreshCw, FileText, Check, ArrowDownToLine, PackageOpen, DownloadCloud, Radio, Activity } from 'lucide-react';
import { peerService } from './services/PeerService';

const EXPIRE_TIME_MS = 10 * 60 * 1000; // 10 Minutes

const generateShortId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function App() {
  // --- Common State ---
  const [isReceiver, setIsReceiver] = useState(false);
  const [transferState, setTransferState] = useState<TransferState>(TransferState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  // --- Sender State ---
  const [activeSession, setActiveSession] = useState<SharedSession | null>(null);
  const [senderDownloadCount, setSenderDownloadCount] = useState(0);

  // --- Receiver State ---
  const [remoteManifest, setRemoteManifest] = useState<Omit<SharedFileEntry, 'file'>[] | null>(null);
  const [fileProgressMap, setFileProgressMap] = useState<Record<string, FileProgress>>({});
  
  // --- Refs (Buffers & Logic) ---
  const hostIdRef = useRef<string | null>(null);
  const didInitRef = useRef(false);
  const activeFileIdRef = useRef<string | null>(null);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const receivedBytesRef = useRef(0);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const downloadQueueRef = useRef<string[]>([]);
  const isQueueProcessingRef = useRef(false);
  const manifestIntervalRef = useRef<any>(null);

  // --- Initialization ---
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const hash = window.location.hash.replace('#', '');
    
    if (hash) {
      setIsReceiver(true);
      hostIdRef.current = hash;
      startReceiver(hash);
    } else {
      peerService.destroy();
    }
  }, []);

  // --- Cleanup ---
  useEffect(() => {
      return () => {
          if (manifestIntervalRef.current) clearInterval(manifestIntervalRef.current);
      };
  }, []);

  // --- Speedometer & Logic Loop ---
  useEffect(() => {
    const interval = setInterval(() => {
      // Receiver Speed Calculation
      if (isReceiver && activeFileIdRef.current) {
        const fid = activeFileIdRef.current;
        const now = Date.now();
        const timeDiff = (now - lastTimeRef.current) / 1000;
        
        if (timeDiff >= 0.5) {
            const currentBytes = receivedBytesRef.current;
            const diff = currentBytes - lastBytesRef.current;
            
            if (diff >= 0) {
                const speedStr = formatSpeed(diff / timeDiff);
                setFileProgressMap(prev => ({
                    ...prev,
                    [fid]: { ...prev[fid], speed: speedStr }
                }));
            }
            lastBytesRef.current = currentBytes;
            lastTimeRef.current = now;
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isReceiver]);

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return "0 MB/s";
    const mb = bytesPerSec / (1024 * 1024);
    if (mb < 0.1) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${mb.toFixed(1)} MB/s`;
  };

  // ================= SENDER LOGIC =================

  const handleFilesSelect = async (files: File[]) => {
    setErrorMsg(null);
    setTransferState(TransferState.INITIALIZING);
    setStatusText("Initializing secure network...");
    setSenderDownloadCount(0);

    const customId = generateShortId();
    
    try {
      await peerService.initialize(customId);
      
      const shareUrl = `${window.location.origin}${window.location.pathname}#${customId}`;
      const sessionFiles: SharedFileEntry[] = files.map((f, i) => ({
          id: `${customId}-${i}-${Date.now()}`,
          name: f.name,
          size: f.size,
          type: f.type,
          file: f,
          downloadCount: 0,
          lastDownloaded: undefined
      }));

      const newSession: SharedSession = {
        sessionId: customId,
        files: sessionFiles,
        totalSize: sessionFiles.reduce((acc, f) => acc + f.size, 0),
        createdAt: Date.now(),
        expiresAt: Date.now() + EXPIRE_TIME_MS,
        shareUrl
      };
      
      setActiveSession(newSession);
      setTransferState(TransferState.WAITING);

      // Listeners
      peerService.on('connection', (conn) => {
         console.log("Peer connected. Waiting for manifest request.");
      });

      peerService.on('data', (data) => {
         if (typeof data === 'string') {
             try {
                const msg = JSON.parse(data);
                
                // Handle Manifest Request (Handshake)
                if (msg.type === 'REQUEST_MANIFEST') {
                     console.log("Received REQUEST_MANIFEST, sending file list.");
                     // Strip file objects before sending
                     const manifest = sessionFiles.map(({file, ...rest}) => rest);
                     peerService.sendManifest({
                         type: 'MANIFEST',
                         files: manifest,
                         totalSize: newSession.totalSize
                     });
                }

                if (msg.type === 'REQUEST_DOWNLOAD') {
                    const fileEntry = sessionFiles.find(f => f.id === msg.fileId);
                    if (fileEntry && fileEntry.file) {
                        setTransferState(TransferState.TRANSFERRING);
                        peerService.sendFile(fileEntry.file, fileEntry.id).catch(err => {
                             console.error("Send failed", err);
                        });
                    }
                }
                
                if (msg.type === 'DOWNLOAD_COMPLETE') {
                    // Update stats
                    setSenderDownloadCount(prev => prev + 1);
                    setTransferState(TransferState.WAITING);
                    
                    setActiveSession(prev => {
                        if (!prev) return null;
                        const updatedFiles = prev.files.map(f => {
                            if (f.id === msg.fileId) {
                                return {
                                    ...f,
                                    downloadCount: f.downloadCount + 1,
                                    lastDownloaded: Date.now()
                                };
                            }
                            return f;
                        });
                        return { ...prev, files: updatedFiles };
                    });
                }
             } catch (e) {}
         }
      });

      peerService.on('transfer_complete', () => {
         // Wait for next request
         setTransferState(TransferState.WAITING);
      });

    } catch (err: any) {
       setErrorMsg("Failed to create share room.");
       setTransferState(TransferState.FAILED);
    }
  };

  const handleStopSharing = () => {
    peerService.destroy();
    window.location.href = window.location.origin + window.location.pathname;
  };

  // ================= RECEIVER LOGIC =================

  const startReceiver = async (hostId: string) => {
     setErrorMsg(null);
     setTransferState(TransferState.INITIALIZING);
     setStatusText("Connecting to host...");

     try {
         await peerService.initialize();
         setTransferState(TransferState.CONNECTING);
         await peerService.connectToHost(hostId);
         
         setStatusText("Connected. Requesting file list...");
         
         setupReceiverListeners();

         // Handshake: Request Manifest
         const requestManifest = () => {
            console.log("Requesting manifest...");
            peerService.sendMessage(JSON.stringify({ type: 'REQUEST_MANIFEST' }));
         };

         requestManifest();
         // Retry handshake every 2 seconds until successful
         if (manifestIntervalRef.current) clearInterval(manifestIntervalRef.current);
         manifestIntervalRef.current = setInterval(requestManifest, 2000);

     } catch (err: any) {
         setTransferState(TransferState.FAILED);
         setErrorMsg("Host unavailable. The link may have expired.");
     }
  };

  const setupReceiverListeners = () => {
      peerService.on('data', (data: any) => {
          // --- Control Messages ---
          if (typeof data === 'string') {
             try {
                 const msg = JSON.parse(data);
                 
                 if (msg.type === 'MANIFEST') {
                     // Handshake Success
                     if (manifestIntervalRef.current) {
                         clearInterval(manifestIntervalRef.current);
                         manifestIntervalRef.current = null;
                     }

                     setRemoteManifest(msg.files);
                     // Initialize progress map
                     const initialMap: Record<string, FileProgress> = {};
                     msg.files.forEach((f: any) => {
                         initialMap[f.id] = { 
                             transferred: 0, 
                             total: f.size, 
                             percentage: 0, 
                             speed: '0 MB/s', 
                             status: 'idle' 
                         };
                     });
                     setFileProgressMap(initialMap);
                     setTransferState(TransferState.CONNECTED);
                 }
                 
                 else if (msg.type === 'FILE_START') {
                     // Prepare for incoming file
                     activeFileIdRef.current = msg.fileId;
                     receivedChunksRef.current = [];
                     receivedBytesRef.current = 0;
                     lastBytesRef.current = 0;
                     lastTimeRef.current = Date.now();
                     
                     setFileProgressMap(prev => ({
                         ...prev,
                         [msg.fileId]: { ...prev[msg.fileId], status: 'downloading' }
                     }));
                 }
                 
                 else if (msg.type === 'FILE_END') {
                     finalizeFileDownload(msg.fileId);
                 }

             } catch (e) {}
          }
          // --- Binary Data ---
          else if (data instanceof ArrayBuffer || (data.buffer && data.buffer instanceof ArrayBuffer)) {
              const buffer = data instanceof ArrayBuffer ? data : data.buffer;
              const fid = activeFileIdRef.current;
              
              if (fid) {
                  receivedChunksRef.current.push(buffer);
                  receivedBytesRef.current += buffer.byteLength;
                  
                  setFileProgressMap(prev => {
                      const current = prev[fid];
                      if (!current) return prev;
                      
                      const pct = Math.min((receivedBytesRef.current / current.total) * 100, 100);
                      
                      // Check byte-exact finish
                      if (receivedBytesRef.current >= current.total) {
                           // Trigger finalize via timeout to allow render update
                           setTimeout(() => finalizeFileDownload(fid), 0);
                      }

                      return {
                          ...prev,
                          [fid]: { 
                              ...current, 
                              transferred: receivedBytesRef.current,
                              percentage: pct 
                          }
                      };
                  });
              }
          }
      });
      
      peerService.on('disconnected', () => {
         if (transferState !== TransferState.COMPLETED) {
             // Don't show error if we are just reloading or intentional close
         }
      });
  };

  const finalizeFileDownload = (fileId: string) => {
      // Prevent double finalization
      setFileProgressMap(prev => {
          if (prev[fileId].status === 'completed' || prev[fileId].status === 'saved') return prev;
          
          console.log(`Finalizing ${fileId}`);
          const blob = new Blob(receivedChunksRef.current, { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          
          // Notify sender
          peerService.sendMessage(JSON.stringify({ type: 'DOWNLOAD_COMPLETE', fileId }));
          
          // Process next in queue
          activeFileIdRef.current = null;
          isQueueProcessingRef.current = false;
          setTimeout(processDownloadQueue, 100);

          return {
              ...prev,
              [fileId]: { ...prev[fileId], percentage: 100, status: 'completed', blobUrl: url }
          };
      });
  };

  // --- Queue System ---
  const queueDownload = (fileId: string) => {
      setFileProgressMap(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], status: 'queued' }
      }));
      downloadQueueRef.current.push(fileId);
      processDownloadQueue();
  };

  const processDownloadQueue = () => {
      if (isQueueProcessingRef.current || downloadQueueRef.current.length === 0) return;
      
      const nextId = downloadQueueRef.current.shift();
      if (nextId) {
          isQueueProcessingRef.current = true;
          // Request File
          peerService.sendMessage(JSON.stringify({ type: 'REQUEST_DOWNLOAD', fileId: nextId }));
      }
  };

  const handleDownloadAll = () => {
      if (!remoteManifest) return;
      // Filter only idle files
      const toQueue = remoteManifest.filter(f => fileProgressMap[f.id]?.status === 'idle');
      toQueue.forEach(f => {
          setFileProgressMap(prev => ({
            ...prev,
            [f.id]: { ...prev[f.id], status: 'queued' }
          }));
          downloadQueueRef.current.push(f.id);
      });
      processDownloadQueue();
  };

  const saveFileToDisk = (fileId: string, fileName: string) => {
      const info = fileProgressMap[fileId];
      if (info && info.blobUrl) {
          const a = document.createElement('a');
          a.href = info.blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setFileProgressMap(prev => ({
              ...prev,
              [fileId]: { ...prev[fileId], status: 'saved' }
          }));
      }
  };

  // --- Renders ---

  const renderReceiver = () => {
      if (transferState === TransferState.FAILED) {
          return (
             <div className="bg-white p-8 rounded-[2rem] shadow-xl text-center border border-gray-100 max-w-md w-full mx-4">
                 <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in">
                     <AlertCircle className="w-8 h-8" />
                 </div>
                 <h2 className="text-xl font-bold text-gray-900">Connection Failed</h2>
                 <p className="text-gray-500 mt-2 mb-6 leading-relaxed">{errorMsg || "Unknown Error"}</p>
                 <button onClick={() => window.location.reload()} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold w-full hover:bg-black transition-colors shadow-lg shadow-gray-200">Retry Connection</button>
             </div>
          );
      }

      if (!remoteManifest) {
          return (
             <div className="bg-white p-12 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center mx-4 max-w-sm w-full">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-75"></div>
                    <Loader2 className="w-12 h-12 text-brand-600 animate-spin relative z-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 text-center">{statusText}</h3>
                <p className="text-gray-400 text-sm mt-2 text-center">Establishing secure channel...</p>
             </div>
          );
      }

      return (
          <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden min-h-[500px] flex flex-col animate-in fade-in slide-in-from-bottom-4 mx-4 mb-8">
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-200 shrink-0">
                             <PackageOpen className="w-6 h-6" />
                          </div>
                          <div>
                              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Ready to Download</h2>
                              <p className="text-sm text-gray-500 font-medium">
                                  {remoteManifest.length} Files • {formatBytes(remoteManifest.reduce((a,b) => a+b.size, 0))}
                              </p>
                          </div>
                      </div>
                      <button 
                        onClick={handleDownloadAll}
                        className="hidden md:flex px-6 py-3 bg-gray-900 hover:bg-brand-600 text-white rounded-xl font-bold transition-all shadow-md items-center gap-2"
                      >
                          <DownloadCloud className="w-4 h-4" /> Download All
                      </button>
                  </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gray-50/30">
                  {remoteManifest.map(file => {
                      const prog = fileProgressMap[file.id];
                      const status = prog?.status || 'idle';
                      
                      return (
                          <div key={file.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                              <div className="flex items-center gap-4">
                                  {/* Icon */}
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors
                                      ${status === 'completed' || status === 'saved' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 group-hover:text-brand-600 group-hover:bg-brand-50'}
                                  `}>
                                      {status === 'downloading' ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : <FileText className="w-6 h-6" />}
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-bold text-gray-900 truncate text-sm md:text-base">{file.name}</h4>
                                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500 mt-1">
                                          <span>{formatBytes(file.size)}</span>
                                          {status === 'downloading' && (
                                              <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full ml-1 border border-brand-100">
                                                  {prog.speed}
                                              </span>
                                          )}
                                          {status === 'queued' && <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-1 border border-amber-100">Queued</span>}
                                          {status === 'saved' && <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-1 border border-green-100 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
                                      </div>
                                      
                                      {/* Progress Bar */}
                                      {(status === 'downloading' || status === 'completed' || status === 'saved') && (
                                          <div className="h-1.5 w-full bg-gray-100 rounded-full mt-3 overflow-hidden">
                                              <div 
                                                  className={`h-full transition-all duration-300 ${status === 'downloading' ? 'bg-brand-600' : 'bg-green-500'}`} 
                                                  style={{ width: `${prog.percentage}%` }}
                                              ></div>
                                          </div>
                                      )}
                                  </div>

                                  {/* Action Button */}
                                  <div className="shrink-0">
                                      {status === 'idle' && (
                                          <button 
                                            onClick={() => queueDownload(file.id)}
                                            className="p-3 bg-gray-50 hover:bg-brand-600 hover:text-white text-gray-600 rounded-xl transition-all shadow-sm"
                                            title="Download File"
                                          >
                                              <ArrowDownToLine className="w-5 h-5" />
                                          </button>
                                      )}
                                      {(status === 'completed' || status === 'saved') && (
                                           <button 
                                              onClick={() => saveFileToDisk(file.id, file.name)}
                                              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2
                                                 ${status === 'saved' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-brand-600 text-white shadow-brand-200 shadow-lg hover:-translate-y-0.5'}
                                              `}
                                           >
                                               {status === 'saved' ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                                               {status === 'saved' ? 'Saved' : 'Save'}
                                           </button>
                                      )}
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
              
              {/* Mobile Download All */}
              <div className="p-4 border-t border-gray-100 md:hidden bg-white sticky bottom-0 z-10">
                 <button 
                    onClick={handleDownloadAll}
                    className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                      <DownloadCloud className="w-5 h-5" /> Download All Files
                  </button>
              </div>
          </div>
      );
  };

  // ================= MAIN RENDER =================

  if (isReceiver) {
      return (
        <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center py-8">
             {renderReceiver()}
        </div>
      );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-brand-100 selection:text-brand-900 bg-[#f8fafc]">
      {/* Navbar */}
      <nav className="border-b border-gray-200/50 bg-white/80 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.reload()}>
            <div className="relative">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <Share2 className="w-5 h-5 md:w-6 md:h-6 relative z-10" />
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 rounded-2xl transition-opacity"></div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full animate-bounce"></div>
            </div>
            <div className="flex flex-col">
                <span className="text-xl md:text-2xl font-extrabold tracking-tight text-gray-900 group-hover:text-brand-600 transition-colors">TempoShare</span>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest hidden md:block">Secure P2P Network</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {activeSession && (
                 <button onClick={handleStopSharing} className="text-sm font-semibold text-gray-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50">
                    Reset
                 </button>
             )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-16 flex flex-col items-center">
        {!activeSession && (
          <div className="text-center mb-10 md:mb-16 max-w-3xl relative z-10 animate-in slide-in-from-bottom-5 fade-in duration-700 px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-600 text-xs font-bold uppercase tracking-widest mb-6 border border-brand-100">
                <Activity className="w-3 h-3" /> Live P2P Network
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 mb-6 tracking-tight leading-[1.1]">
              Share files <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-purple-600 relative">
                instantly & securely.
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-brand-200 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                    <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>
            </h1>
            <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10 leading-relaxed max-w-xl mx-auto font-medium">
              No server uploads. No file size limits. Direct device-to-device transfer encrypted by WebRTC.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 text-xs md:text-sm font-bold text-gray-600">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100"><Shield className="w-4 h-4 text-brand-600" /> End-to-End Encrypted</div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100"><Network className="w-4 h-4 text-purple-600" /> Peer-to-Peer</div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100"><Zap className="w-4 h-4 text-amber-500" /> Blazing Fast</div>
            </div>
          </div>
        )}

        <div className="w-full relative z-10 flex justify-center animate-in zoom-in-95 duration-500">
          {activeSession ? (
            transferState === TransferState.INITIALIZING ? (
                 <div className="bg-white p-12 rounded-[2.5rem] shadow-xl border border-gray-100 flex flex-col items-center max-w-sm w-full mx-4">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-75"></div>
                        <Loader2 className="w-12 h-12 text-brand-600 animate-spin relative z-10" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Creating Secure Room...</h3>
                    <p className="text-gray-400 text-sm mt-2">Generating encryption keys</p>
                 </div>
            ) : (
                <ActiveShareCard 
                  session={activeSession} 
                  onStopSharing={handleStopSharing}
                  transferState={transferState}
                  downloadCount={senderDownloadCount}
                />
            )
          ) : (
            <FileUpload onFilesSelect={handleFilesSelect} />
          )}
        </div>
      </main>

      <footer className="py-8 md:py-12 text-center text-gray-400 text-sm relative z-10 bg-gradient-to-t from-gray-50 to-transparent mt-12">
        <p className="font-medium">&copy; {new Date().getFullYear()} TempoShare. Built for the modern web.</p>
      </footer>
    </div>
  );
}

export default App;
