# 🔥 NEW IDE ARCHITECTURE - Core Refactored

## The New Truth

Your IDE now has **ONE SOURCE OF TRUTH**: the ProjectEngine.

Everything else observes and acts through it.

```
┌─────────────────────────────────────────┐
│          React UI (Observer)             │
│  (Terminal, Editor, Explorer, Status)   │
└────────────────┬────────────────────────┘
                 │ Events + State
                 │
┌─────────────────────────────────────────┐
│      IDE CORE ENGINE (The Reality)      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ FileSystemManager               │   │
│  │ (Real disk: the source of truth)│   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ProcessManager                  │   │
│  │ (Real OS processes)             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ProjectStateGraph               │   │
│  │ (Memory: dependencies, errors)  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ CommandBus + EventBus           │   │
│  │ (Change coordinator)            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ AIAgent                         │   │
│  │ (Intelligent operator)          │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Core Components

### 1. 📁 FileSystemManager
**Location:** `server/src/core/FileSystemManager.ts`

**What it does:**
- Reads/writes/deletes files from the REAL disk
- Watches filesystem for changes (chokidar)
- Manages file locks (prevents concurrent writes)
- Computes file hashes (detects real changes)
- Traverses the real directory structure

**Key methods:**
```typescript
async scan(): Promise<Map<string, FileInfo>>        // Scan real FS
async read(filepath: string): Promise<string>       // Read real file
async write(filepath: string, content: string)      // Write real file
async create(filepath: string, content: string)     // Create real file
async delete(filepath: string)                      // Delete real file
watch(callback)                                     // Watch FS changes
```

**Truth:** The disk is the truth. Everything matches disk state.

---

### 2. ⚙️ ProcessManager
**Location:** `server/src/core/ProcessManager.ts`

**What it does:**
- Spawns REAL child processes (using Node.js `spawn`)
- Captures stdout/stderr in real-time
- Tracks exit codes
- Manages process lifecycle

**Key methods:**
```typescript
async spawn(command: string, cwd?: string): Promise<ProcessResult>
async execute(command: string, cwd?: string): Promise<ProcessResult>
getRunning(): ProcessInfo[]
async kill(id: string): void
```

**Truth:** When npm installs, node_modules actually gets created.

---

### 3. 🧠 ProjectStateGraph
**Location:** `server/src/core/ProjectStateGraph.ts`

**What it does:**
- Maintains a living graph of the project
- Tracks files, errors, dependencies
- Records process executions
- Generates insights

**Key methods:**
```typescript
async initialize(files: Map<string, FileInfo>)
recordFileCreated(path: string)
recordFileDeleted(path: string)
recordFileModified(path: string)
recordProcessExecution(command: string, exitCode: number)
recordError(error: string)
addDependency(fromPath: string, toPath: string)
getSnapshot(): any
```

**Truth:** The project memory - always synced with reality.

---

### 4. 🚌 CommandBus + EventBus
**Location:** `server/src/core/Bus.ts`

**What it does:**
- CommandBus: sequencer for all changes
- EventBus: broadcasts when things happen

**Commands (changes):**
```typescript
CreateFile
UpdateFile
DeleteFile
RunProcess
ReadFile
ListFiles
GetState
CreateSnapshot
RestoreSnapshot
```

**Events (notifications):**
```typescript
FileCreated
FileUpdated
FileDeleted
ProcessStarted
ProcessCompleted
ProcessFailed
ErrorOccurred
```

**Truth:** All state changes go through commands. All state reads produce events.

---

### 5. 🔥 ProjectEngine
**Location:** `server/src/core/ProjectEngine.ts`

**What it does:**
- Orchestrates all core components
- Only entry point to change the project
- Manages snapshots (for rollback)
- Emits events for UI to listen to

**Key methods:**
```typescript
async initialize(): void
async execute(command: Command): Promise<any>
async getState(): Promise<ProjectState>
async readFile(filepath: string): Promise<string>
async writeFile(filepath: string, content: string): void
async createFile(filepath: string, content?: string): void
async deleteFile(filepath: string): void
async runProcess(command: string, cwd?: string): Promise<ProcessResult>
async createSnapshot(label: string): Promise<ProjectSnapshot>
subscribe(listener): () => void
```

**Truth:** Nothing in the project changes without going through here.

---

### 6. 🤖 AIAgent
**Location:** `server/src/core/AIAgent.ts`

**What it does:**
- Acts as an intelligent operator (not just observer)
- Reads the REAL project state
- Creates plans based on reality
- Executes plans via ProjectEngine
- Verifies results by reading real state

**Workflow:**

```
User: "add auth service"
    ↓
AIAgent.handleUserIntent()
    ↓
1. READ real state
   (files, errors, structure)
    ↓
2. CREATE PLAN
   (based on reality, not imagination)
    ↓
3. VALIDATE PLAN
   (check dependencies, risks)
    ↓
4. EXECUTE PLAN
   (via ProjectEngine → filesystem/processes)
    ↓
5. VERIFY RESULTS
   (read disk state again, not pretend)
    ↓
✅ Return actual result
```

**Key methods:**
```typescript
async createPlan(intent: string, aiService?: any): Promise<AIPlan>
async validatePlan(plan: AIPlan): Promise<Validation>
async executePlan(plan: AIPlan): Promise<AIExecutionResult>
async verify(result: AIExecutionResult): Promise<Verification>
async handleUserIntent(intent: string): Promise<Workflow>
```

**Truth:** The AI only knows what's real. It doesn't invent.

---

## Initialization Flow

1. **Server starts** (`npm run dev`)

2. **POST /api/init** is called
   ```typescript
   const engine = await initializeProjectEngine({
     projectPath: 'C:\\Users\\melly',
     serverPort: 3001
   });
   ```

3. **ProjectEngine.initialize()**
   - FileSystemManager scans real disk
   - ProjectStateGraph loads files
   - FS Watcher starts listening
   - Everything ready

4. **AI can now operate**
   ```typescript
   const aiAgent = new AIAgent(engine);
   const result = await aiAgent.handleUserIntent("create auth service");
   ```

---

## Event Flow (Real Example)

### Scenario: Terminal creates a file

```
Terminal (UI): User types "touch src/auth.ts"
    ↓
API /api/terminal/execute
    ↓
AIAgent → ProjectEngine.execute(RunProcessCommand)
    ↓
ProcessManager spawns: spawn("touch", ["src/auth.ts"])
    ↓
OS creates: C:\Users\melly\src\auth.ts
    ↓
FileSystemManager watcher detects: "add" event
    ↓
ProjectEngine emits: FileCreatedEvent
    ↓
Explorer listens to FileCreatedEvent
    → UI updates: new file visible
    
Editor listens to FileCreatedEvent
    → UI can open file
    
AIAgent knows file exists (reads state)
    → Can reference in next operations
```

**KEY:** No invention. No simulation. All real.

---

## API Changes

### Old (broken):
```
POST /api/terminal/execute
  → TerminalExecutor.execute()
  → Pretend execution
  → Return fake result
```

### New (real):
```
POST /api/terminal/execute
  → AIAgent.handleUserIntent()
  → ProjectEngine.execute(RunProcessCommand)
  → ProcessManager spawns REAL process
  → FileSystemManager writes REAL files
  → ProjectStateGraph updates MEMORY
  → EventBus broadcasts TRUTH
  → UI receives real state
```

---

## Why This Works

1. **No silos**
   - Terminal outputs = real process output
   - Explorer shows = real disk state
   - Editor edits = real file

2. **No illusions**
   - IA reads truth, not imagination
   - UI observes real changes
   - No cache invalidation needed

3. **Perfect causality**
   ```
   Action → Engine → Real change → Event → UI update
   ```

4. **Rollback possible**
   - Snapshots preserve state
   - Can restore to any point

5. **AI is intelligent**
   - Knows what's real
   - Can reference actual files
   - Can predict based on reality

---

## What Stays the Same

- PostgreSQL for user data
- React UI (now just observing)
- Express API layer (now calls core)

## What Changes Radically

- **Terminal** = real processes, not simulation
- **Explorer** = real disk, not static structure
- **Editor** = real files, not React state
- **IA** = operator, not chatbot

---

## Current Status

✅ ProjectEngine - created
✅ FileSystemManager - created
✅ ProcessManager - created
✅ CommandBus / EventBus - created
✅ ProjectStateGraph - created
✅ AIAgent - created
✅ Server initialization - updated
⏳ API endpoints - need refactoring
⏳ React UI - need refactoring (observe not control)
⏳ Testing - needed

---

## Next Steps (When You're Ready)

1. **Adapt API endpoints** to use ProjectEngine
   ```typescript
   // files.ts
   app.get('/api/files/list', async (req, res) => {
     const engine = getProjectEngine();
     const files = await engine.getFileSystem().listAll();
     res.json(files);
   });
   ```

2. **Adapt React hooks** to subscribe to events
   ```typescript
   useEffect(() => {
     const engine = getProjectEngine();
     const unsub = engine.subscribe(event => {
       setFiles(event.files); // React receives REAL state
     });
     return unsub;
   }, []);
   ```

3. **Test the workflow**
   ```bash
   npm run dev
   POST /api/init  # Start the engine
   # Terminal executes → Real file created → Explorer updates
   ```

---

## The Philosophy

> An IDE is not a UI that pretends to be an IDE.
>
> An IDE is an engine that is a project, with a UI observing it.

You now have the engine. The UI will follow.
