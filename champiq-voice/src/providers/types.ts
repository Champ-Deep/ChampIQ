export interface Message {
  speaker: 'agent' | 'lead';
  text: string;
  timestamp: string; // ISO string
}

export interface CallParams {
  toNumber: string;
  leadName: string;
  company: string;
  email: string;
  script?: string;
  dynamicVars?: Record<string, string>;
  // Context from ChampGraph — injected automatically
  prevSummary?: string;
  prevOutcome?: string;
  prevCallDate?: string;
  // Per-call credential overrides (from ChampIQ Canvas credential store)
  elevenlabsApiKey?: string;
  elevenlabsAgentId?: string;
  elevenlabsPhoneNumberId?: string;
}

export interface ProviderCallResult {
  conversationId: string;
  providerRaw: Record<string, unknown>;
}

export interface WebhookPayload {
  callId: string;           // champiq callId (passed as dynamic var)
  conversationId: string;   // provider conversation ID
  transcript: Message[];
  status: string;           // raw provider status string
  durationSeconds?: number;
  recordingUrl?: string;
}

export interface IVoiceProvider {
  readonly name: string;
  initiateCall(params: CallParams): Promise<ProviderCallResult>;
  getTranscript(conversationId: string): Promise<Message[]>;
  cancelCall(conversationId: string): Promise<void>;
  /** Parse and validate an inbound webhook body + signature. Throws on invalid signature. */
  parseWebhook(body: unknown, signature: string, secret?: string): WebhookPayload;
}
