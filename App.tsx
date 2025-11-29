import React, { useState, useEffect, useRef } from 'react';
import { SharedSession, SharedFileEntry, TransferState, FileProgress, FileDownloadStatus } from './types';
import { FileUpload } from './components/FileUpload';
import { ActiveShareCard } from './components/ActiveShareCard';
import { Zap, Shield, Network, Loader2, Download, Share2, AlertCircle, RefreshCw, FileText, Check, ArrowDownToLine, PackageOpen, DownloadCloud } from 'lucide-react';
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
          file: f
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
                    setSenderDownloadCount(prev => prev + 1);
                    setTransferState(TransferState.WAITING);
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
             // But for now, simple alert
             // setErrorMsg("Connection lost with host."); 
             // Keep UI if we have data? No, P2P lost means can't download more.
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
             <div className="bg-white p-8 rounded-3xl shadow-xl text-center border border-gray-100 max-w-md w-full">
                 <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertCircle className="w-8 h-8" />
                 </div>
                 <h2 className="text-xl font-bold text-gray-900">Connection Failed</h2>
                 <p className="text-gray-500 mt-2 mb-6">{errorMsg || "Unknown Error"}</p>
                 <button onClick={() => window.location.reload()} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold w-full">Retry</button>
             </div>
          );
      }

      if (!remoteManifest) {
          return (
             <div className="bg-white p-12 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-brand-600 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-gray-900">{statusText}</h3>
             </div>
          );
      }

      return (
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden min-h-[500px] flex flex-col animate-in fade-in slide-in-from-bottom-4">
              {/* Header */}
              <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200">
                             <PackageOpen className="w-6 h-6" />
                          </div>
                          <div>
                              <h2 className="text-2xl font-bold text-gray-900">Ready to Download</h2>
                              <p className="text-sm text-gray-500 font-medium">
                                  {remoteManifest.length} Files • {formatBytes(remoteManifest.reduce((a,b) => a+b.size, 0))}
                              </p>
                          </div>
                      </div>
                      <button 
                        onClick={handleDownloadAll}
                        className="hidden sm:flex px-6 py-3 bg-gray-900 hover:bg-brand-600 text-white rounded-xl font-bold transition-all shadow-md items-center gap-2"
                      >
                          <DownloadCloud className="w-4 h-4" /> Download All
                      </button>
                  </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
                  {remoteManifest.map(file => {
                      const prog = fileProgressMap[file.id];
                      const status = prog?.status || 'idle';
                      
                      return (
                          <div key={file.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                              <div className="flex items-center gap-4">
                                  {/* Icon */}
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 
                                      ${status === 'completed' || status === 'saved' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}
                                  `}>
                                      {status === 'downloading' ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : <FileText className="w-6 h-6" />}
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-bold text-gray-900 truncate">{file.name}</h4>
                                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mt-0.5">
                                          <span>{formatBytes(file.size)}</span>
                                          {status === 'downloading' && (
                                              <span className="text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded ml-2">
                                                  {prog.speed}
                                              </span>
                                          )}
                                          {status === 'queued' && <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-2">Queued</span>}
                                          {status === 'saved' && <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded ml-2">Saved</span>}
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
                                            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                          >
                                              <ArrowDownToLine className="w-5 h-5" />
                                          </button>
                                      )}
                                      {(status === 'completed' || status === 'saved') && (
                                           <button 
                                              onClick={() => saveFileToDisk(file.id, file.name)}
                                              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2
                                                 ${status === 'saved' ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white shadow-brand-200 shadow-lg hover:translate-y-[-1px]'}
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
              <div className="p-4 border-t border-gray-100 sm:hidden bg-white">
                 <button 
                    onClick={handleDownloadAll}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                      <DownloadCloud className="w-4 h-4" /> Download All
                  </button>
              </div>
          </div>
      );
  };

  // ================= MAIN RENDER =================

  if (isReceiver) {
      return (
        <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-4">
             {renderReceiver()}
        </div>
      );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-brand-100 selection:text-brand-900">
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">TempoShare</span>
          </div>
          <div className="flex items-center gap-4">
             {activeSession && (
                 <button onClick={handleStopSharing} className="text-sm font-semibold text-gray-600 hover:text-red-600 transition-colors">
                    Reset
                 </button>
             )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12 lg:py-20 flex flex-col items-center">
        {!activeSession && (
          <div className="text-center mb-12 max-w-2xl relative z-10 animate-in slide-in-from-bottom-5 fade-in duration-700">
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-6 tracking-tight leading-tight">
              Share files <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-purple-600">
                instantly.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-500 mb-10 leading-relaxed max-w-lg mx-auto">
              Direct P2P transfer. Unlimited size. Multiple files.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold text-gray-600 bg-white/50 p-4 rounded-2xl border border-gray-100 backdrop-blur-sm shadow-sm inline-flex">
              <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-brand-600" /> Secure</div>
              <div className="flex items-center gap-2"><Network className="w-5 h-5 text-purple-600" /> P2P</div>
              <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Fast</div>
            </div>
          </div>
        )}

        <div className="w-full relative z-10 flex justify-center animate-in zoom-in-95 duration-500">
          {activeSession ? (
            transferState === TransferState.INITIALIZING ? (
                 <div className="bg-white p-12 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-brand-600 animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-gray-900">Creating Secure Room...</h3>
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

      <footer className="py-8 text-center text-gray-400 text-sm relative z-10">
        <p>&copy; {new Date().getFullYear()} TempoShare. Secure P2P Network.</p>
      </footer>
    </div>
  );
}

export default App;
