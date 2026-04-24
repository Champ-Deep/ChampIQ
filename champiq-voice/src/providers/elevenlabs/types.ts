export interface ELOutboundCallRequest {
  agent_id: string;
  agent_phone_number_id: string;
  to_number: string;
  conversation_initiation_client_data: {
    type: 'conversation_initiation_client_data';
    dynamic_variables: Record<string, string>;
  };
}

export interface ELOutboundCallResponse {
  conversation_id: string;
  [key: string]: unknown;
}

export interface ELTranscriptResponse {
  conversation_id: string;
  status: string;
  transcript: Array<{
    role: 'agent' | 'user';
    message: string;
    time_in_call_secs: number;
  }>;
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
  };
}

export interface ELWebhookMessage {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs: number;
}

export interface ELWebhookPayload {
  type: string;
  event_timestamp: number;
  data: {
    conversation_id: string;
    agent_id: string;
    status: string;
    transcript: ELWebhookMessage[];
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      recording_url?: string;
    };
    analysis?: {
      data_collection_results?: Record<string, { value?: string }>;
    };
  };
}
