import Peer, { DataConnection } from 'peerjs';
import { ManifestMsg } from '../types';

type EventHandler = (data: any) => void;

class PeerService {
  private static instance: PeerService;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private eventListeners: Map<string, EventHandler[]> = new Map();
  private isBusy: boolean = false;
  
  private constructor() {}

  public static getInstance(): PeerService {
    if (!PeerService.instance) {
      PeerService.instance = new PeerService();
    }
    return PeerService.instance;
  }

  // --- Event System ---
  public on(event: string, handler: EventHandler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(handler);
  }

  public off(event: string, handler: EventHandler) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      this.eventListeners.set(event, handlers.filter(h => h !== handler));
    }
  }

  private emit(event: string, data?: any) {
    this.eventListeners.get(event)?.forEach(handler => handler(data));
  }

  // --- Core Peer Logic ---

  public initialize(customId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.peer) {
        if (this.peer.id === customId && !this.peer.disconnected && !this.peer.destroyed) {
          resolve(this.peer.id);
          return;
        }
        this.peer.destroy();
      }

      console.log(`[PeerService] Initializing Peer with ID: ${customId || 'Auto'}`);

      this.peer = new Peer(customId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ]
        }
      });

      const timeout = setTimeout(() => {
         reject(new Error("Peer initialization timed out. Check network."));
      }, 10000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.emit('ready', id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        this.emit('error', err);
      });

      this.peer.on('disconnected', () => {
        try { this.peer?.reconnect(); } catch(e) {}
      });
    });
  }

  public connectToHost(hostId: string, retryCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer || this.peer.destroyed) {
        reject(new Error("Peer not initialized"));
        return;
      }

      const conn = this.peer.connect(hostId, {
        reliable: true,
      });

      const timeout = setTimeout(() => {
        conn.close();
        if (retryCount < 3) {
           setTimeout(() => {
             this.connectToHost(hostId, retryCount + 1).then(resolve).catch(reject);
           }, 1000); 
        } else {
           reject(new Error("Host unavailable or connection timed out."));
        }
      }, 5000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this.handleConnection(conn);
        resolve();
      });

      conn.on('close', () => {
          // Handled in handleConnection
      });
    });
  }

  private handleConnection(conn: DataConnection) {
    if (this.conn) {
      this.conn.close();
    }
    this.conn = conn;

    this.conn.on('data', (data) => {
      this.emit('data', data);
    });

    this.conn.on('close', () => {
      this.emit('disconnected');
    });

    this.conn.on('error', (err) => {
      this.emit('error', err);
    });

    this.emit('connection', conn);
  }

  public sendMessage(msg: any) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  // --- Transfer Logic ---

  public sendManifest(manifest: ManifestMsg) {
     this.sendMessage(JSON.stringify(manifest));
  }

  public async sendFile(file: File, fileId: string) {
    if (!this.conn || !this.conn.open) throw new Error("No active connection");
    if (this.isBusy) throw new Error("Channel busy");
    
    this.isBusy = true;
    const CHUNK_SIZE = 16 * 1024; // 16KB
    
    console.log(`[PeerService] Sending file: ${file.name}`);

    // 1. Send File Start Signal
    this.conn.send(JSON.stringify({
      type: 'FILE_START',
      fileId: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type
    }));

    await new Promise(r => setTimeout(r, 50));

    // 2. Stream Chunks
    let offset = 0;
    
    const sendNextChunk = () => {
       if (!this.conn || !this.conn.open) {
           this.isBusy = false;
           this.emit('error', new Error("Connection lost during transfer"));
           return;
       }

       const slice = file.slice(offset, offset + CHUNK_SIZE);
       const reader = new FileReader();

       reader.onload = (e) => {
         const buffer = e.target?.result as ArrayBuffer;
         this.conn?.send(buffer);

         offset += buffer.byteLength;
         
         this.emit('transfer_progress', {
             fileId: fileId,
             transferred: offset,
             total: file.size
         });

         if (offset < file.size) {
            // @ts-ignore
            const buffered = this.conn.dataChannel?.bufferedAmount || 0;
            if (buffered > 512 * 1024) { 
               setTimeout(sendNextChunk, 50); 
            } else {
               setTimeout(sendNextChunk, 0); 
            }
         } else {
            // Done
            console.log('[PeerService] File Sent.');
            this.conn?.send(JSON.stringify({ type: 'FILE_END', fileId }));
            this.isBusy = false;
            this.emit('transfer_complete', { fileId });
         }
       };

       reader.readAsArrayBuffer(slice);
    };

    sendNextChunk();
  }

  public destroy() {
    if (this.conn) {
        this.conn.close();
        this.conn = null;
    }
    if (this.peer) {
        this.peer.destroy();
        this.peer = null;
    }
    this.isBusy = false;
    this.eventListeners.clear();
    PeerService.instance = null as any;
  }
}

export const peerService = PeerService.getInstance();
