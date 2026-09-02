/** About Cortex: version, pinned images, links, and the Aulendur Labs blurb. */
import type { GuideTab } from '../types';

export const aboutTab: GuideTab = {
  id: 'about-cortex',
  title: 'About Cortex',
  intro:
    'Cortex is an OpenAI-compatible gateway and admin console for running vLLM and llama.cpp models on your own hardware. It starts one managed container per model, meters every request against scoped API keys, and is built for air-gapped hosts: pinned engine images, offline model folders and transfer bundles instead of live downloads.',
  sections: [
    {
      id: 'facts',
      title: 'Facts',
      blocks: [
        {
          kind: 'table',
          caption: 'This installation',
          columns: ['Fact', 'Value'],
          rows: [
            ['Version', '**v{{VERSION}}**'],
            ['vLLM image', '`{{VLLM_IMAGE}}`'],
            ['llama.cpp image', '`{{LLAMACPP_IMAGE}}`'],
            ['Models directory', '`{{MODELS_DIR}}`'],
            ['Gateway', '`{{GATEWAY_URL}}`'],
            ['Source', '[{{REPO_URL}}]({{REPO_URL}})'],
            ['Documentation', '[{{DOCS_URL}}]({{DOCS_URL}})'],
          ],
        },
      ],
    },
    {
      id: 'aulendur-labs',
      title: 'Aulendur Labs',
      blocks: [
        {
          kind: 'p',
          md: 'Cortex is the open-source model-serving infrastructure of [Aulendur Labs](https://aulendur.com) (Omaha, Nebraska). Founded in 2024 by Aaron Parker (CEO) and Jorden Gershenson (CTO), both with more than ten years in defense, the company builds forecasting and operational-intelligence systems under the tagline "Predict Everything": DeepLoom, a planetary-scale model for cross-domain forecasting (weather, energy, markets, logistics), and the WeaveCast Platform, its API gateway. The team holds TS/SCI clearances and builds for on-premises, ATO-ready deployment in defense and government environments.',
        },
      ],
    },
    {
      id: 'capabilities',
      title: 'Capabilities',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'API', md: 'OpenAI-compatible chat, completions and embeddings\nStreaming (SSE) responses' },
            { title: 'Access', md: 'Scoped API keys with IP allowlists and expiry\nOrganizations and users; per-key usage metering' },
            { title: 'Models', md: 'One managed container per model (vLLM or llama.cpp)\nDry run, readiness checks and live logs' },
            { title: 'Reuse', md: 'Recipes: save and reload a model configuration' },
            { title: 'Air-gap', md: 'Transfer bundles: images, weights and config on a USB drive\nOffline model folders; pinned engine images' },
            { title: 'Observability', md: 'Prometheus metrics for the gateway and engines\nUsage journal with CSV export' },
          ],
        },
      ],
    },
  ],
  attribution: '',
};
