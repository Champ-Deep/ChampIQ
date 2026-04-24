import { Router } from 'express';
import { z } from 'zod';
import { CallOrchestrator } from '../../orchestrator/CallOrchestrator.js';
import { validateBody } from '../middleware/validate.js';

const InitiateSchema = z.object({
  to_number: z.string().min(7),
  lead_name: z.string().optional(),
  company: z.string().optional(),
  email: z.string().optional(),
  script: z.string().optional(),
  flow_id: z.string().optional(),
  canvas_node_id: z.string().optional(),
  provider: z.string().optional(),
  agent_id: z.string().optional(),
  dynamic_vars: z.record(z.string()).optional(),
  // Per-call credential overrides from ChampIQ Canvas credential store
  elevenlabs_api_key: z.string().optional(),
  elevenlabs_phone_number_id: z.string().optional(),
  // ChampIQ Canvas shape support
  phone_number: z.string().optional(),
  call_id: z.string().optional(),
  metadata: z.object({
    prospect_id: z.string().optional(),
    lead_name: z.string().optional(),
    company: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

export function callsRouter(orchestrator: CallOrchestrator): Router {
  const router = Router();

  // POST /v1/calls — initiate a call
  router.post('/', validateBody(InitiateSchema), async (req, res) => {
    try {
      const body = req.body as z.infer<typeof InitiateSchema>;

      // Support both champiq native and ChampIQ Canvas flow shapes
      const toNumber = body.to_number ?? body.phone_number ?? '';
      const leadName = body.lead_name ?? body.metadata?.lead_name;
      const company = body.company ?? body.metadata?.company;
      const email = body.email ?? body.metadata?.email;

      if (!toNumber) {
        res.status(400).json({ error: 'to_number is required' });
        return;
      }

      const result = await orchestrator.initiateCall({
        toNumber,
        leadName,
        company,
        email,
        script: body.script,
        flowId: body.flow_id,
        canvasNodeId: body.canvas_node_id,
        provider: body.provider,
        agentId: body.agent_id,
        dynamicVars: body.dynamic_vars,
        elevenlabsApiKey: body.elevenlabs_api_key,
        elevenlabsPhoneNumberId: body.elevenlabs_phone_number_id,
      });

      res.status(201).json(result);
    } catch (err) {
      console.error('[calls] initiate error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /v1/calls/:callId
  router.get('/:callId', async (req, res) => {
    try {
      const node = await orchestrator.getCall(req.params['callId']);
      if (!node) { res.status(404).json({ error: 'Call not found' }); return; }
      res.json(node);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /v1/calls?contact=+1555...&flow=flow_abc
  router.get('/', async (req, res) => {
    try {
      const contact = req.query['contact'] as string | undefined;
      const flow = req.query['flow'] as string | undefined;

      if (contact) {
        const calls = await orchestrator.listContactCalls(contact);
        res.json({ calls });
        return;
      }
      if (flow) {
        const calls = await orchestrator.listFlowCalls(flow);
        res.json({ calls });
        return;
      }

      res.status(400).json({ error: 'Provide ?contact=<phone> or ?flow=<flowId>' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
