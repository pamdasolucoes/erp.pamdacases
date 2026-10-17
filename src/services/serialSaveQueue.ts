export interface SaveQueueState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  revision: number;
  savedRevision: number;
  error: unknown;
}

// A queue belongs to one authenticated user and one draft. Navigation must not
// destroy it. The adapter must check identity and validate the RPC response.
export class SerialSaveQueue<T> {
  private latest: {revision:number;value:T} | null = null;
  private running: Promise<void> | null = null;
  private paused = false;
  private state: SaveQueueState = {status:'idle',revision:0,savedRevision:0,error:null};
  private listeners = new Set<(state:SaveQueueState)=>void>();

  constructor(private write:(value:T)=>Promise<void>) {}

  subscribe(listener:(state:SaveQueueState)=>void) {
    this.listeners.add(listener);listener({...this.state});
    return ()=>{this.listeners.delete(listener);};
  }
  getState():SaveQueueState {return {...this.state};}

  enqueue(value:T) {
    this.latest={revision:this.state.revision+1,value:structuredClone(value)};
    this.state={...this.state,status:'saving',revision:this.latest.revision,error:null};
    this.notify();this.start();
  }

  // Pause before logout or cancellation. An already submitted request may have
  // committed, so wait for it; never claim cancellation/rollback locally.
  async pause() {this.paused=true;await this.running;}
  resume() {this.paused=false;this.start();}
  async retry() {this.state={...this.state,error:null};return this.flush();}
  async flush():Promise<boolean> {
    while(!this.paused && this.state.savedRevision<this.state.revision && !this.state.error){
      this.start();await this.running;
    }
    return this.state.savedRevision===this.state.revision;
  }

  private start() {
    if(this.running || this.paused || !this.latest || this.state.savedRevision===this.state.revision) return;
    this.running=Promise.resolve().then(()=>this.drain()).finally(()=>{this.running=null;});
  }
  private async drain() {
    while(!this.paused && this.latest && this.state.savedRevision<this.latest.revision){
      const snapshot=this.latest;
      this.state={...this.state,status:'saving',error:null};this.notify();
      try{
        await this.write(structuredClone(snapshot.value));
        this.state={...this.state,savedRevision:snapshot.revision};
        // An older acknowledged snapshot cannot announce that newer edits are saved.
        if(this.state.savedRevision===this.state.revision){this.state={...this.state,status:'saved'};this.notify();}
      }catch(error){this.state={...this.state,status:'error',error};this.notify();return;}
    }
  }
  private notify(){for(const listener of this.listeners) listener(this.getState());}
}
