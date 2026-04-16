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
  $id: string;
  title: string;
  description: string;
  'x-champiq': XChampiq;
  type: 'object';
  properties: {
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
