/**
 * Node configuration field schemas for the RightPanel inspector.
 *
 * Pure data — read-only configuration that drives the form-tab UI of the
 * node inspector. Never serialized to the API, never sent to any external
 * server, never reaches a route. Adding/removing a field here changes only
 * which inputs appear in the inspector; the underlying node config stays
 * a free-form Record<string, unknown>.
 *
 * Originally embedded in RightPanel.tsx; extracted on 2026-05-01 (refactor)
 * so the file is grep-able and the panel itself stays focused on rendering.
 */

export interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'json' | 'credential'
  options?: string[]
  placeholder?: string
  hint?: string
}

// For tool nodes: action → specific input fields shown when that action is selected
export const ACTION_FIELDS: Record<string, Record<string, FieldDef[]>> = {
  champmail: {
    add_prospect: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'first_name', label: 'First name', type: 'text', placeholder: '{{item.first_name}}' },
      { key: 'last_name', label: 'Last name', type: 'text', placeholder: '{{item.last_name}}' },
      { key: 'company', label: 'Company', type: 'text', placeholder: '{{item.company}}' },
    ],
    start_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'sequence_id', label: 'Sequence ID', type: 'text', placeholder: 'seq_abc123' },
    ],
    enroll_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'sequence_id', label: 'Sequence ID', type: 'text', placeholder: 'seq_abc123' },
    ],
    pause_sequence: [
      { key: 'email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
    ],
    send_single_email: [
      { key: 'email', label: 'To email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Following up…' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Hi {{item.first_name}},…' },
    ],
    get_analytics: [
      { key: 'sequence_id', label: 'Sequence ID (optional)', type: 'text' },
    ],
    list_templates: [],
  },
  champgraph: {
    create_prospect: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'first_name', label: 'First name', type: 'text', placeholder: '{{item.first_name}}' },
      { key: 'last_name', label: 'Last name', type: 'text', placeholder: '{{item.last_name}}' },
      { key: 'company_name', label: 'Company', type: 'text', placeholder: '{{item.company}}' },
      { key: 'title', label: 'Title', type: 'text', placeholder: '{{item.title}}' },
    ],
    list_prospects: [
      { key: 'limit', label: 'Max results', type: 'number' },
      { key: 'status', label: 'Filter by status (optional)', type: 'text', placeholder: 'cold' },
    ],
    get_prospect_status: [
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{item.email}}',
        hint: 'Returns engagement_status: replied | opened | cold | not_found — use in downstream switch/if.' },
    ],
    bulk_import: [
      { key: 'prospects', label: 'Prospects (JSON array)', type: 'textarea',
        placeholder: '[{"email":"a@b.com","first_name":"Alice"}]' },
    ],
    research_prospects: [
      { key: 'prospect_ids', label: 'Prospect UUIDs (JSON array)', type: 'textarea',
        placeholder: '["uuid1","uuid2"]' },
      { key: 'concurrency', label: 'Concurrency', type: 'number' },
    ],
    campaign_essence: [
      { key: 'description', label: 'Campaign description', type: 'textarea',
        placeholder: 'Cold outreach to SaaS CTOs about our AI tool' },
      { key: 'target_audience', label: 'Target audience', type: 'text',
        placeholder: 'CTO at B2B SaaS companies' },
    ],
    enroll_sequence: [
      { key: 'sequence_id', label: 'Sequence ID', type: 'text', placeholder: 'seq_abc123' },
      { key: 'prospect_email', label: 'Prospect email', type: 'text', placeholder: '{{item.email}}' },
    ],
    analytics_overview: [],
    list_sequences: [],
    list_campaigns: [],
  },
  champvoice: {
    initiate_call: [
      { key: 'to_number', label: 'Phone number (E.164)', type: 'text',
        placeholder: '{{item.phone}}', hint: 'Include country code. e.g. +14155551234 or {{item.phone_number}}' },
      { key: 'lead_name', label: 'Lead name', type: 'text', placeholder: '{{item.first_name}}' },
      { key: 'company', label: 'Company', type: 'text', placeholder: '{{item.company}}' },
      { key: 'email', label: 'Lead email', type: 'text', placeholder: '{{item.email}}' },
      { key: 'engagement_status', label: 'Engagement status (optional)', type: 'text',
        placeholder: '{{prev.engagement_status}}',
        hint: 'Passed as a dynamic variable to the AI agent so it can tailor its opener.' },
      { key: 'call_reason', label: 'Call reason (optional)', type: 'select',
        options: ['', 'cold_outreach', 'email_follow_up', 'sequence_completed', 'replied_follow_up'] },
      { key: 'agent_id', label: 'Agent ID override (optional)', type: 'text',
        placeholder: 'Leave blank to use credential default' },
    ],
    get_call_status: [
      { key: 'conversation_id', label: 'Conversation ID', type: 'text', placeholder: '{{prev.conversationId}}',
        hint: 'ElevenLabs conversation ID from initiate_call output' },
    ],
    list_calls: [],
    cancel_call: [],
  },
  lakeb2b_pulse: {
    track_page: [
      { key: 'page_url', label: 'LinkedIn URL', type: 'text', placeholder: '{{item.linkedin_url}}' },
    ],
    schedule_engagement: [
      { key: 'prospect_id', label: 'Prospect ID', type: 'text', placeholder: '{{prev.id}}' },
      { key: 'action_type', label: 'Action type', type: 'select',
        options: ['like', 'comment', 'connect', 'message'] },
      { key: 'message', label: 'Message (optional)', type: 'textarea' },
    ],
    list_posts: [
      { key: 'page_url', label: 'LinkedIn profile URL', type: 'text', placeholder: '{{item.linkedin_url}}' },
      { key: 'limit', label: 'Max posts', type: 'number' },
    ],
    get_engagement_status: [
      { key: 'prospect_id', label: 'Prospect ID', type: 'text', placeholder: '{{prev.id}}' },
    ],
  },
}

export const KIND_FIELDS: Record<string, FieldDef[]> = {
  'trigger.manual': [
    { key: 'label', label: 'Trigger label', type: 'text', placeholder: 'Run workflow' },
    { key: 'items', label: 'Input items (JSON array or leave blank)', type: 'textarea',
      placeholder: '[{"email":"a@b.com","name":"Alice"},...]',
      hint: 'Paste a JSON array or upload a CSV via the chat panel. Downstream nodes access these as {{ trigger.payload.items }} — note the .payload prefix.' },
  ],
  'trigger.webhook': [
    { key: 'path', label: 'Webhook path', type: 'text', placeholder: '/hooks/my-event' },
    { key: 'secret', label: 'Signing secret (optional)', type: 'text' },
  ],
  'trigger.cron': [
    { key: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5',
      hint: 'Examples: "0 9 * * 1-5" = weekdays 9am · "0 8 * * *" = daily 8am' },
    { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'UTC' },
  ],
  'trigger.event': [
    { key: 'event', label: 'Event name', type: 'text', placeholder: 'email.replied' },
    { key: 'source', label: 'Source tool (optional)', type: 'text', placeholder: 'champmail' },
  ],
  'http': [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/endpoint' },
    { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    { key: 'headers', label: 'Headers (JSON object)', type: 'textarea',
      placeholder: '{"Authorization":"Bearer {{credential.token}}"}' },
    { key: 'body', label: 'Body (JSON or text)', type: 'textarea',
      placeholder: '{"text":"{{prev.message}}"}' },
    { key: 'credential', label: 'Credential', type: 'credential' },
  ],
  'set': [
    { key: 'fields', label: 'Fields (JSON object — keys = output fields, values = expressions)',
      type: 'textarea', placeholder: '{"email":"{{prev.email}}","name":"{{prev.first}} {{prev.last}}"}' },
  ],
  'merge': [
    { key: 'mode', label: 'Merge mode', type: 'select', options: ['all', 'first'] },
  ],
  'if': [
    { key: 'condition', label: 'Condition expression', type: 'text',
      placeholder: 'prev.tier == "enterprise"',
      hint: 'Raw expression — do NOT wrap in {{ }} (the node wraps it for you). Emits branch "true" or "false" downstream.' },
  ],
  'switch': [
    { key: 'value', label: 'Value expression', type: 'text', placeholder: '{{ prev.status }}' },
    { key: 'cases', label: 'Cases (JSON array: [{match,branch}])', type: 'textarea',
      placeholder: '[{"match":"positive","branch":"positive"},{"match":"negative","branch":"negative"}]' },
    { key: 'default_branch', label: 'Default branch name', type: 'text', placeholder: 'other' },
  ],
  'loop': [
    { key: 'items', label: 'Items expression', type: 'text',
      placeholder: '{{ prev.payload.items }}',
      hint: 'Must resolve to a JSON array at runtime.' },
    { key: 'mode', label: 'Cadence mode', type: 'select',
      options: ['parallel', 'sequential', 'paced'],
      hint: 'parallel = run together (use Concurrency) · sequential = one after another · paced = fixed gap between starts.' },
    { key: 'concurrency', label: 'Concurrency (parallel items in flight)', type: 'number',
      hint: 'Only used when mode=parallel. Forced to 1 for paced mode.' },
    { key: 'pace_seconds', label: 'Pace seconds (gap between starts)', type: 'number',
      hint: 'mode=paced: enforced exactly. mode=sequential: gap between body completions. 120 = 2 min · 3600 = 1 h.' },
    { key: 'initial_delay_seconds', label: 'Initial delay (seconds, before first item)', type: 'number' },
    { key: 'jitter_seconds', label: 'Jitter (± seconds added to each gap)', type: 'number',
      hint: 'Adds uniform random ± to each pace gap — helps avoid spam-filter pattern detection on cold-email cadences.' },
    { key: 'max_items', label: 'Max items (cap, 0 = no cap)', type: 'number',
      hint: 'Useful while testing — process only the first N rows of a CSV.' },
    { key: 'stop_on_error', label: 'Stop on error', type: 'select', options: ['false', 'true'],
      hint: 'If an item fails, abort the rest. Default: continue with remaining items.' },
    { key: 'each', label: 'Per-item transform (JSON object of expressions)', type: 'textarea',
      placeholder: '{"email":"{{item.email}}","name":"{{item.name}}"}' },
    { key: 'wait_for_event', label: 'Wait for event before next item', type: 'text',
      placeholder: 'transcript.ready',
      hint: 'Event-driven gating (independent of cadence). Leave blank for normal operation.' },
    { key: 'wait_timeout', label: 'Wait-for-event timeout (seconds)', type: 'number',
      hint: 'Max seconds to wait per item before moving on. Default: 300.' },
  ],
  'split': [
    { key: 'mode', label: 'Split mode', type: 'select', options: ['fixed_n', 'fan_out'],
      hint: '"fixed_n" distributes items evenly. "fan_out" sends full list to each branch.' },
    { key: 'n', label: 'Number of branches', type: 'number' },
    { key: 'items', label: 'Items expression', type: 'text', placeholder: '{{ prev.records }}' },
  ],
  'wait': [
    { key: 'seconds', label: 'Wait duration (seconds)', type: 'number',
      hint: '3600 = 1h · 86400 = 1 day · 259200 = 3 days' },
  ],
  'code': [
    { key: 'expression', label: 'Python expression', type: 'textarea',
      placeholder: '{"result": [r for r in prev["records"] if r.get("tier") == "enterprise"]}' },
  ],
  'llm': [
    { key: 'prompt', label: 'Prompt', type: 'textarea',
      placeholder: 'Write a personalised 1-sentence opener for {{item.name}} at {{item.company}}.' },
    { key: 'system', label: 'System prompt (optional)', type: 'textarea' },
    { key: 'json_mode', label: 'JSON mode', type: 'select', options: ['false', 'true'] },
    { key: 'model', label: 'Model override (optional)', type: 'text', placeholder: 'anthropic/claude-3-haiku' },
  ],
  'champmail_reply': [
    { key: 'credential', label: 'ChampMail credential', type: 'credential' },
  ],
  // Tool nodes — defined below as combined action + credential + dynamic inputs
  'champmail': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['add_prospect', 'start_sequence', 'pause_sequence', 'send_single_email',
        'get_analytics', 'list_templates', 'enroll_sequence'] },
    { key: 'credential', label: 'ChampMail credential', type: 'credential',
      hint: '⚠ Required. Add via Credentials section in the left sidebar.' },
  ],
  'champgraph': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['create_prospect', 'list_prospects', 'get_prospect_status', 'bulk_import',
                'research_prospects', 'campaign_essence', 'enroll_sequence',
                'analytics_overview', 'list_sequences', 'list_campaigns'] },
    { key: 'credential', label: 'ChampGraph credential', type: 'credential',
      hint: 'Same email+password as ChampMail admin. Use champmail-admin credential.' },
  ],
  'champvoice': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['initiate_call', 'get_call_status', 'list_calls', 'cancel_call'],
      hint: 'The champiq-voice gateway routes this to ElevenLabs. No ChampServer login needed.' },
    { key: 'credential', label: 'ChampVoice credential', type: 'credential',
      hint: 'Must contain elevenlabs_api_key, agent_id, phone_number_id. Add via the Credentials panel.' },
  ],
  'lakeb2b_pulse': [
    { key: 'action', label: 'Action', type: 'select',
      options: ['track_page', 'schedule_engagement', 'list_posts', 'get_engagement_status'] },
    { key: 'credential', label: 'LakeB2B credential (optional)', type: 'credential' },
  ],
}

// Kinds that have action-aware dynamic input sections
export const TOOL_KINDS_WITH_ACTIONS = new Set(['champmail', 'champgraph', 'champvoice', 'lakeb2b_pulse'])
