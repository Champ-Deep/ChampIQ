// Types derived from JSON Schema 2020-12 manifests.
// To regenerate: npx json-schema-to-typescript manifests/*.json -o packages/shared-types/src/generated/

export interface XChampiqFieldExtension {
  widget: 'select' | 'text' | 'number' | 'textarea';
  populate_from?: string;
}

export interface XChampiqCanvasNode {
  label: string;
  icon: string;
  color: string;
  accepts_input_from: string[];
}

export interface XChampiqRestAction {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  button_label: string;
  async: boolean;
}

export interface XChampiqTransportRest {
  action: XChampiqRestAction;
  health: string;
  populate: Record<string, string>;
}

export interface XChampiqTransportCli {
  binary: string;
  command: string;
  args: string[];
}

export interface XChampiq {
  tool_id: string;
  version: string;
  category: string;
  status: 'active' | 'inactive' | 'beta';
  canvas: { node: XChampiqCanvasNode };
  transport: {
    rest: XChampiqTransportRest;
    cli?: XChampiqTransportCli;
  };
}

export interface ChampIQManifest {
  $schema: string;
  $id?: string;
  title?: string;
  description?: string;
  'x-champiq'?: XChampiq;
  type?: 'object';
  properties?: {
    input: Record<string, unknown>;
    config: {
      type: 'object';
      title: string;
      required?: string[];
      properties: Record<string, unknown>;
    };
    output: {
      type: 'object';
      properties: Record<string, unknown>;
    };
  };

  // --- Manifest v2 (orchestrator-native) ---
  manifest_version?: 2;
  tool_id?: string;
  name?: string;
  category?: string;
  color?: string;
  icon?: string;
  credentials_required?: string[];
  actions?: ChampIQManifestAction[];
  triggers?: ChampIQManifestTrigger[];
  nodes?: ChampIQManifestSystemNode[];
}

export interface ChampIQManifestAction {
  id: string;
  label: string;
  input_schema?: Record<string, unknown>;
}

export interface ChampIQManifestTrigger {
  kind: 'event' | 'webhook' | 'cron' | 'manual';
  event?: string;
  label?: string;
}

export interface ChampIQManifestSystemNode {
  kind: string;
  label: string;
  group?: string;
}

export interface WorkflowPatch {
  add_nodes?: unknown[];
  add_edges?: unknown[];
  remove_node_ids?: string[];
  update_nodes?: { id: string; data: Record<string, unknown> }[];
}

export interface ChatMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  workflow_patch?: WorkflowPatch | null;
  created_at: string;
}

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export interface NodeRuntimeState {
  status: NodeStatus;
  jobId?: string;
  output?: Record<string, unknown>;
  error?: string;
  inputPayload?: Record<string, unknown>;
  /** Set to true by Run All to auto-trigger this node when its dependencies are done. */
  pendingRun?: boolean;
}

/** Lightweight canvas metadata stored in the sidebar list and localStorage index. */
export interface CanvasMeta {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  message: string;
}

export interface CanvasState {
  nodes: unknown[];
  edges: unknown[];
  updatedAt: string;
}
