/**
 * Getting Started: three sub-tabs (welcome, first-model tutorial, environment diagnostics).
 * Content only — wording was audited against the code; keep facts here, not in TSX. Tokens
 * ({{GATEWAY_URL}}, {{MODELS_DIR}}, {{VLLM_IMAGE}}, …) come from ../interpolate; the tutorial
 * adds {{MODEL_*}} facts for the starter model the reader picks (see STARTER_MODELS).
 */
import type { GuideTab, GuideTabGroup } from '../types';

export type StarterModelId = 'phi-2' | 'gemma';

export type StarterModel = {
  id: StarterModelId;
  name: string;
  hfRepo: string;
  hfUrl: string;
  params: string;
  vram: string;
  description: string;
  folderName: string;
  license: string;
  gated: boolean;
};

export const STARTER_MODELS: StarterModel[] = [
  {
    id: 'phi-2',
    name: 'Microsoft Phi-2',
    hfRepo: 'microsoft/phi-2',
    hfUrl: 'https://huggingface.co/microsoft/phi-2',
    params: '2.7B',
    vram: '~6 GB',
    description: 'Compact but capable model from Microsoft. Great for testing due to small size. No gated access required.',
    folderName: 'phi-2',
    license: 'MIT (open)',
    gated: false,
  },
  {
    id: 'gemma',
    name: 'Google Gemma 3 1B',
    hfRepo: 'google/gemma-3-1b-it',
    hfUrl: 'https://huggingface.co/google/gemma-3-1b-it',
    params: '1.0B',
    vram: '~3 GB',
    description: 'Instruction-tuned model from Google. Very small and fast. Requires accepting license on HuggingFace.',
    folderName: 'gemma-3-1b-it',
    license: 'Gemma License',
    gated: true,
  },
];

/** The {{MODEL_*}} facts the tutorial interpolates for the chosen starter model. */
export function starterModelFacts(m: StarterModel): Record<string, string> {
  return {
    MODEL_NAME: m.name,
    MODEL_REPO: m.hfRepo,
    MODEL_URL: m.hfUrl,
    MODEL_PARAMS: m.params,
    MODEL_VRAM: m.vram,
    MODEL_FOLDER: m.folderName,
    MODEL_GATED: m.gated ? 'yes' : '',
  };
}

/** The four "Quick Health Check" commands, rendered by the `diagnostic-checks` custom block. */
export const DIAGNOSTIC_CHECKS: Array<{ title: string; command: string; ok: string; fail: string }> = [
  { title: 'NVIDIA Driver Status', command: 'nvidia-smi', ok: 'GPU info displayed with driver version', fail: 'Command not found or driver error' },
  { title: 'Docker Running', command: 'docker ps', ok: 'List of containers (even if empty)', fail: 'Cannot connect to Docker daemon' },
  { title: 'Docker GPU Access', command: 'docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi', ok: 'GPU info displayed inside container', fail: 'GPU access denied or CUDA error' },
  { title: 'Models Directory', command: 'ls -la {{MODELS_DIR}}', ok: 'Directory exists with your model folders', fail: 'No such directory or permission denied' },
];

export const TUTORIAL_HREF = '/guide?tab=getting-started#first-model';

export const welcomeTab: GuideTab = {
  id: 'welcome',
  title: 'Welcome to Cortex',
  intro:
    "Cortex is your unified control plane for deploying and managing Large Language Models (LLMs) on your infrastructure. Whether you're running chat assistants, code completion models, or embedding services—Cortex handles the complexity so you can focus on putting AI to work.",
  lead: [
    { kind: 'custom', id: 'welcome-hero' },
    { kind: 'custom', id: 'host-ip-banner' },
  ],
  sections: [
    {
      id: 'what-cortex-does',
      title: 'What Cortex Does For You',
      blocks: [
        {
          kind: 'cards',
          items: [
            { icon: '🚀', title: 'Deploy Models Easily', md: 'Download models from HuggingFace or use local files. Cortex handles container orchestration, GPU allocation, and health monitoring automatically.' },
            { icon: '🔌', title: 'Standard API Interface', md: 'All models expose the same OpenAI-compatible API. Your applications connect to one endpoint—Cortex routes requests to the right model.' },
            { icon: '🔐', title: 'Secure Access Control', md: 'Create API keys with scopes, IP allowlists and expiry dates. Every request is metered against its key, user and organization.' },
            { icon: '📊', title: 'Monitor Everything', md: "Real-time GPU utilization, token throughput, request latency—all visible in the dashboard. Know exactly what's happening." },
            { icon: '⚙️', title: 'Two Inference Engines', md: 'vLLM for high-throughput HuggingFace models. llama.cpp for GGUF files and specialized architectures. Choose what works best.' },
            { icon: '🏢', title: 'Multi-Tenant Ready', md: 'Organize users into organizations and programs, attribute API keys to them, and filter usage per team.' },
          ],
        },
      ],
    },
    {
      id: 'how-it-works',
      title: 'How Cortex Works',
      blocks: [
        { kind: 'p', md: "Cortex sits between your applications and your GPU infrastructure. When you add a model, Cortex spins up an isolated Docker container running the appropriate inference engine. Applications send requests to Cortex's gateway, which validates credentials and routes to the model container." },
        { kind: 'p', md: '**Your Application** (SDK / curl / UI) → **Cortex Gateway** (auth & routing) → **Model Container** (vLLM or llama.cpp) → **GPU Hardware** (your infrastructure)' },
        {
          kind: 'cards',
          items: [
            { title: 'Single Endpoint', md: "All models accessible via one URL—your applications don't need to know which GPU runs which model" },
            { title: 'Hot Swapping', md: 'Start, stop, and reconfigure models without affecting other running services' },
            { title: 'Resource Isolation', md: 'Each model runs in its own container on the GPUs you select; stopping one never touches the others' },
          ],
        },
      ],
    },
    {
      id: 'admin-capabilities',
      title: 'What You Can Do as Administrator',
      blocks: [
        { kind: 'h', level: 3, text: 'Model Management' },
        { kind: 'checklist', items: ['Add models from HuggingFace Hub or local storage', 'Configure GPU allocation and memory utilization', 'Start, stop, and restart model containers', 'View real-time logs and run health tests', 'Save configurations as reusable recipes'] },
        { kind: 'h', level: 3, text: 'Access Control' },
        { kind: 'checklist', items: ['Create API keys with scoped permissions', 'Assign keys to specific users and organizations', 'Restrict keys to IP addresses or CIDR ranges and give them an expiry date', 'Revoke access instantly when needed', 'Track all API usage by key and user'] },
        { kind: 'h', level: 3, text: 'Monitoring & Analytics' },
        { kind: 'checklist', items: ['Monitor GPU utilization and memory across all cards', 'Track tokens generated, latency, and throughput', 'View usage breakdowns by user and organization', 'Watch GPU, host and container metrics on the Health and System Monitor pages', "Scrape the gateway's Prometheus `/metrics` endpoint from your own monitoring"] },
        { kind: 'h', level: 3, text: 'Team Management' },
        { kind: 'checklist', items: ['Create organizations for different teams or projects', 'Add users with appropriate role assignments', 'View per-org and per-user usage statistics', 'Disable or delete accounts and reset passwords', 'Let every user create and revoke their own keys on My API Keys'] },
      ],
    },
    {
      id: 'navigate',
      title: 'Navigate This Interface',
      blocks: [
        {
          kind: 'link-cards',
          items: [
            { title: 'Health', md: 'GPU & system status', href: '/health' },
            { title: 'Models', md: 'Deploy & manage LLMs', href: '/models' },
            { title: 'Chat', md: 'Test models directly', href: '/chat' },
            { title: 'API Keys', md: 'Manage access tokens', href: '/keys' },
            { title: 'Usage', md: 'Analytics & metrics', href: '/usage' },
            { title: 'Transfer', md: 'Export & import bundles', href: '/deployment' },
          ],
        },
      ],
    },
    {
      id: 'ready',
      title: 'Ready to Deploy Your First Model?',
      blocks: [
        { kind: 'p', md: "The next section walks you through downloading a small model from HuggingFace and getting it running in minutes. You'll learn the complete workflow from model acquisition to serving API requests." },
        { kind: 'custom', id: 'tutorial-cta' },
        { kind: 'callout', variant: 'info', title: 'Tip for New Administrators', md: 'Before deploying models, visit the [Health page](/health) to verify your GPUs are detected and have available VRAM. Most deployment issues stem from resource constraints or driver problems.' },
      ],
    },
  ],
  attribution: 'Cortex Getting Started Guide',
};

const CURL_EXAMPLE = `curl -X POST {{GATEWAY_URL}}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "{{MODEL_FOLDER}}",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100
  }'`;

const PYTHON_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    base_url="{{GATEWAY_URL}}/v1",
    api_key="YOUR_API_KEY"  # from the API Keys page
)

response = client.chat.completions.create(
    model="{{MODEL_FOLDER}}",
    messages=[{"role": "user", "content": "Hello, who are you?"}],
    max_tokens=100
)

print(response.choices[0].message.content)`;

export const firstModelTab: GuideTab = {
  id: 'first-model',
  title: 'Spin Up Your First Model',
  intro:
    "This hands-on tutorial walks you through the complete workflow: downloading a model from HuggingFace, adding it to Cortex, and making your first API request. By the end, you'll have a working chat model serving requests on your network.",
  lead: [{ kind: 'p', md: '**~15 minutes** · **Beginner friendly**' }],
  sections: [
    {
      id: 'choose-model',
      title: 'Step 1: Choose a Starter Model',
      intro: 'We recommend starting with a small model to learn the workflow. Here are two excellent options:',
      blocks: [
        { kind: 'custom', id: 'model-picker' },
        { kind: 'callout', variant: 'warning', title: 'Access Required', when: 'MODEL_GATED', md: 'This model requires accepting the license on HuggingFace. Visit [{{MODEL_URL}}]({{MODEL_URL}}) and click "Agree and access repository" before proceeding.' },
      ],
    },
    {
      id: 'prerequisites',
      title: 'Step 2: Verify Prerequisites',
      intro: 'Before downloading the model, ensure your system is ready:',
      blocks: [
        { kind: 'h', level: 3, text: 'Required' },
        {
          kind: 'checklist',
          items: [
            '**Git LFS installed** — `git lfs install` (required for large file downloads)',
            '**Models directory exists** — `sudo mkdir -p {{MODELS_DIR}}` (where Cortex stores model files)',
            '**Write permissions** — `sudo chown -R $USER:$USER {{MODELS_DIR}}` (your user needs write access)',
          ],
        },
        { kind: 'h', level: 3, text: 'Recommended' },
        {
          kind: 'checklist',
          items: [
            '**HuggingFace CLI** — `pip install huggingface_hub` (for token management)',
            '**At least {{MODEL_VRAM}} VRAM** — `nvidia-smi` (check your GPU memory)',
            '**~10 GB disk space** — `df -h {{MODELS_DIR}}` (for model files and cache)',
          ],
        },
        { kind: 'h', level: 3, text: 'Quick Setup Commands' },
        { kind: 'code', text: 'sudo apt-get install -y git-lfs && git lfs install', label: 'Install Git LFS' },
        { kind: 'code', text: 'sudo mkdir -p {{MODELS_DIR}} && sudo chown -R $USER:$USER {{MODELS_DIR}}', label: 'Create models directory' },
      ],
    },
    {
      id: 'download-model',
      title: 'Step 3: Download the Model',
      intro: 'Clone the model repository directly from HuggingFace into your models directory:',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Navigate to models directory', code: 'cd {{MODELS_DIR}}' },
            { title: 'Login to HuggingFace (for gated models)', when: 'MODEL_GATED', md: 'Enter your HuggingFace token when prompted. Get a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).', code: 'huggingface-cli login' },
            { title: 'Clone the model ({{MODEL_NAME}}, ~{{MODEL_PARAMS}} params)', md: 'This downloads all model files. Size varies but expect 3-6 GB for these small models.', code: 'git clone https://huggingface.co/{{MODEL_REPO}}' },
            { title: 'Verify the download', md: 'You should see files like `config.json`, `tokenizer.json`, and `*.safetensors` or `*.bin` files.', code: 'ls -la {{MODELS_DIR}}/{{MODEL_FOLDER}}' },
          ],
        },
      ],
    },
    {
      id: 'add-model',
      title: 'Step 4: Add the Model in Cortex',
      intro: 'Now return to the Cortex interface to register and configure the model:',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Open the Models Page', md: 'Navigate to [Models](/models) in the sidebar.' },
            { title: "Click 'Add Model'", md: 'Click the **Add Model** button in the top right corner. This opens the model configuration wizard.' },
            { title: 'Configure Engine & Mode', md: "Select these options:\n**Engine:** vLLM (best for SafeTensor models)\n**Mode:** Offline (we're using local files)" },
            { title: 'Select the Model Folder', md: 'In the Model Selection step:\n1. Check the read-only **Models directory** (set by `CORTEX_MODELS_DIR`)\n2. Click **Refresh** to list its folders\n3. Select `{{MODEL_FOLDER}}` from the dropdown\n**Note:** Cortex maps your `{{MODELS_DIR}}` host directory to `/models` inside containers.' },
            { title: 'Configure Core Settings', md: "Set these key parameters:\n**Name:** {{MODEL_NAME}} — display name in Cortex\n**Served Model Name:** `{{MODEL_FOLDER}}` — API identifier\n**Task:** generate — chat/completion model\n**GPU:** select one GPU — pick any available GPU\n**Max model length:** 2048 — start small; empty = the model's own maximum\n**GPU memory utilization:** 0.92 (default) — leave empty for the default; lower it on a shared GPU" },
            { title: 'Launch the Model', md: 'Skip the optional steps (Startup Config, Request Defaults) and go to **Summary**. Click **Launch Model** to create the configuration.' },
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Memory Allocation Tips', md: 'If the model fails to start with OOM errors, try reducing `Max model length` or `GPU memory utilization`. Start conservative and increase once working.' },
      ],
    },
    {
      id: 'start-and-test',
      title: 'Step 5: Start and Test Your Model',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Start the Model', md: 'In the Models table, find your model row and click the **Start** button. The state badge will change from `stopped` → `starting` → `loading` → `running` (or `failed`, with the reason in the badge and Logs). While it is loading, the Stop button reads **Cancel**.\nFirst startup takes longer as Docker pulls the inference engine image. Subsequent starts are faster.' },
            { title: 'Monitor Progress', md: "Click the **Logs** button to watch startup progress. You'll see messages about loading model weights into GPU memory. Wait for \"Model loaded successfully\" or similar." },
            { title: 'Run the Built-in Test', md: 'Once the model is `running`, click the **Test** button. This sends a simple prompt and reports whether the model answered and how long the round trip took.' },
          ],
        },
      ],
    },
    {
      id: 'chat-and-api',
      title: 'Step 6: Chat & API Access',
      intro: "Your model is now live! Here's how to interact with it:",
      blocks: [
        {
          kind: 'link-cards',
          items: [
            { title: 'Chat Playground', md: 'The easiest way to test—go to the Chat page and select your model from the dropdown. Type messages and see responses in real-time.', href: '/chat', label: 'Open Chat Playground' },
            { title: 'API Keys', md: 'Send requests from any application using the OpenAI-compatible API with an API key from the All API Keys / My API Keys page.', href: '/keys', label: 'Create an API key' },
          ],
        },
        { kind: 'p', md: '**API endpoint.** Send requests from any application using the OpenAI-compatible API with an API key from the All API Keys / My API Keys page. (The dev stack sets `GATEWAY_DEV_ALLOW_ALL_KEYS=true`, which also accepts requests that carry no key at all.)' },
        { kind: 'code', text: '{{GATEWAY_URL}}/v1/chat/completions', label: 'Chat completions endpoint' },
        { kind: 'h', level: 3, text: 'Example: API Request with curl' },
        { kind: 'code', lang: 'bash', label: 'curl command', text: CURL_EXAMPLE },
        { kind: 'p', md: 'Replace `YOUR_API_KEY` with a key from the [API Keys](/keys) page. In the dev stack (`GATEWAY_DEV_ALLOW_ALL_KEYS=true`) a request without an Authorization header is accepted too.' },
        { kind: 'h', level: 3, text: 'Example: Python with OpenAI SDK' },
        { kind: 'code', lang: 'python', label: 'Python code', text: PYTHON_EXAMPLE },
      ],
    },
    {
      id: 'next-steps',
      title: 'Congratulations!',
      intro: "You've successfully deployed your first LLM with Cortex. You now know the complete workflow from downloading a model to serving API requests. Here are some next steps to explore:",
      blocks: [
        {
          kind: 'list',
          items: [
            'Try a **larger model** like Llama 3.1 8B (needs ~16GB VRAM)',
            'Deploy an **embedding model** for RAG applications',
            'Create **API keys** for team members',
            'Explore **llama.cpp** for GGUF quantized models',
          ],
        },
        { kind: 'callout', variant: 'warning', title: 'Having Issues?', md: 'Check the [Environment Diagnostics](/guide?tab=getting-started#diagnostics) tab for common setup problems, or see the [Model Troubleshooting Guide](/guide?tab=manage-models#troubleshooting) for deployment-specific issues.' },
      ],
    },
  ],
  attribution: 'Cortex First Model Tutorial',
};

const DIAGNOSTIC_SCRIPT = `#!/bin/bash
echo "=== Cortex Environment Diagnostic ==="
echo ""
echo "--- System Info ---"
uname -a
cat /etc/os-release | head -4
echo ""
echo "--- NVIDIA Driver ---"
nvidia-smi --query-gpu=driver_version,cuda_version,name,memory.total --format=csv,noheader 2>/dev/null || echo "NVIDIA driver not found"
echo ""
echo "--- Docker ---"
docker --version 2>/dev/null || echo "Docker not found"
echo ""
echo "--- NVIDIA Container Toolkit ---"
nvidia-container-cli --version 2>/dev/null || echo "NVIDIA Container Toolkit not found"
echo ""
echo "--- Docker GPU Test ---"
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "Docker GPU test failed"
echo ""
echo "--- Models Directory ---"
ls -la {{MODELS_DIR}} 2>/dev/null || echo "{{MODELS_DIR}} not found"
echo ""
echo "--- Disk Space ---"
df -h {{MODELS_DIR}} 2>/dev/null || df -h /
echo ""
echo "=== End Diagnostic ==="`;

export const diagnosticsTab: GuideTab = {
  id: 'diagnostics',
  title: 'Environment Diagnostics',
  intro:
    'This guide helps you verify your Linux environment is properly configured for running Cortex and GPU-accelerated inference engines. Most deployment issues trace back to driver problems, missing dependencies, or misconfigured Docker.',
  sections: [
    {
      id: 'quick-health-check',
      title: 'Quick Health Check',
      intro: 'Run these commands to quickly verify your system is ready for Cortex:',
      blocks: [
        { kind: 'custom', id: 'diagnostic-checks' },
        { kind: 'p', md: 'Then open the [System Health page](/health) to see the GPUs and services Cortex itself detects.' },
      ],
    },
    {
      id: 'nvidia-drivers',
      title: 'NVIDIA Driver Requirements',
      intro: 'Cortex uses Docker containers with CUDA libraries. Your host system needs compatible NVIDIA drivers to provide GPU access to these containers.',
      blocks: [
        { kind: 'h', level: 3, text: 'Minimum Requirements' },
        {
          kind: 'table',
          caption: 'Minimum NVIDIA driver per pinned engine image',
          columns: ['Engine image', 'CUDA', 'Min driver'],
          rows: [
            ['`{{VLLM_IMAGE}}` (default)', '13', '**580**'],
            ['`vllm/vllm-openai:v0.28.0-cu129` (drivers 550–579)', '12.9', '550'],
            ['`{{LLAMACPP_IMAGE}}`', '12.8', '570'],
          ],
        },
        { kind: 'callout', variant: 'info', md: 'The pinned vLLM image (`{{VLLM_IMAGE}}`) is a CUDA 13 build and needs driver 580 or newer. On drivers 550–579 set `VLLM_IMAGE=vllm/vllm-openai:v0.28.0-cu129` in `.env`. llama.cpp b10731 is a CUDA 12.8 build and needs driver 570 or newer.' },
        { kind: 'h', level: 3, text: 'Check Your Driver' },
        { kind: 'code', text: 'nvidia-smi --query-gpu=driver_version --format=csv,noheader', label: 'Shows your current driver version' },
        { kind: 'code', text: 'nvidia-smi --query-gpu=cuda_version --format=csv,noheader', label: 'Shows max CUDA version your driver supports' },
        { kind: 'h', level: 3, text: 'Need to Update Drivers?' },
        { kind: 'p', md: "If your driver is below the required version, update using your distribution's package manager:" },
        { kind: 'code', text: 'sudo apt update && sudo apt install nvidia-driver-580', label: 'Ubuntu/Debian - install driver 580 (570 is enough for llama.cpp only)' },
        { kind: 'p', md: 'Reboot required after driver update. See the [full driver update guide]({{DOCS_URL}}operations/UPDATE_NVIDIA_DRIVERS/) for detailed instructions.' },
      ],
    },
    {
      id: 'docker-gpu',
      title: 'Docker & GPU Access',
      intro: 'Docker needs the NVIDIA Container Toolkit to pass GPU access into containers. This is essential for running vLLM and llama.cpp inference engines.',
      blocks: [
        { kind: 'h', level: 3, text: '1. Verify Docker is Running' },
        { kind: 'code', text: 'sudo systemctl status docker', label: "Should show 'active (running)'" },
        { kind: 'code', text: 'docker --version', label: 'Should show Docker Engine 24 or newer' },
        { kind: 'h', level: 3, text: '2. Verify NVIDIA Container Toolkit' },
        { kind: 'code', text: 'nvidia-container-cli --version', label: 'Should show toolkit version' },
        { kind: 'h', level: 3, text: 'Install NVIDIA Container Toolkit (if missing)' },
        { kind: 'code', text: 'curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg', label: 'Add NVIDIA GPG key' },
        {
          kind: 'code',
          label: 'Add repository',
          text: `curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list`,
        },
        { kind: 'code', text: 'sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit', label: 'Install toolkit' },
        { kind: 'code', text: 'sudo systemctl restart docker', label: 'Restart Docker to apply changes' },
        { kind: 'h', level: 3, text: '3. Test GPU Access in Docker' },
        { kind: 'code', text: 'docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi', label: 'Should show your GPUs inside the container' },
      ],
    },
    {
      id: 'firewall',
      title: 'Firewall Setup (Linux/UFW)',
      intro: 'Cortex gateway runs with **host network mode** for universal access. On Linux systems with UFW firewall enabled, you need to allow Docker container traffic to reach host services.',
      blocks: [
        { kind: 'h', level: 3, text: 'One-Time Setup' },
        { kind: 'code', text: 'make setup-firewall', label: 'Run from Cortex directory (requires sudo)' },
        { kind: 'p', md: 'Or manually: `sudo bash scripts/setup-docker-firewall.sh`' },
        { kind: 'callout', variant: 'info', md: 'This adds a UFW rule to allow traffic from Docker networks (172.16.0.0/12) to host services. It does NOT expose any ports to external networks.' },
        { kind: 'h', level: 3, text: 'After Setup: Access Methods' },
        {
          kind: 'table',
          caption: 'How to reach the gateway from different places',
          columns: ['From', 'URL', 'Note'],
          rows: [
            ['Docker containers', '`http://host.docker.internal:{{GATEWAY_PORT}}`', 'Requires `extra_hosts: ["host.docker.internal:host-gateway"]` in docker-compose'],
            ['LAN devices', '`{{GATEWAY_URL}}`', "Your server's LAN address"],
            ['Same machine', '`http://localhost:{{GATEWAY_PORT}}`', ''],
          ],
        },
        { kind: 'h', level: 3, text: 'Test External Access' },
        { kind: 'code', text: 'make test-external-access', label: 'Run diagnostic to verify Docker containers can reach Cortex' },
      ],
    },
    {
      id: 'common-issues',
      title: 'Common Environment Issues',
      blocks: [
        {
          kind: 'issues',
          items: [
            {
              title: 'nvidia-smi: command not found',
              causes: ['NVIDIA drivers not installed', 'Drivers installed but not loaded', 'System rebooted after failed installation'],
              solutions: ['Install drivers: `sudo apt install nvidia-driver-580`', 'Verify installation: `dpkg -l | grep nvidia`', 'Check kernel module: `lsmod | grep nvidia`', 'Reboot if drivers were just installed'],
            },
            {
              title: 'Docker: permission denied',
              causes: ['User not in docker group', 'Docker daemon not running', 'Socket permissions incorrect'],
              solutions: ['Add user to docker group: `sudo usermod -aG docker $USER`', 'Log out and log back in for group changes to apply', 'Start Docker: `sudo systemctl start docker`', 'Or use sudo for Docker commands'],
            },
            {
              title: 'GPU not accessible in container',
              causes: ['NVIDIA Container Toolkit not installed', 'Docker not configured for GPU', 'Incompatible CUDA version', '`--gpus` flag not passed to container'],
              solutions: ['Install NVIDIA Container Toolkit (see above)', 'Restart Docker after toolkit installation', 'Update NVIDIA driver to support container CUDA version', 'Cortex handles `--gpus` automatically—check logs for errors'],
            },
            {
              title: 'CUDA version mismatch',
              causes: ["Driver too old for container's CUDA version", 'vLLM v0.28.0 needs CUDA 13 (driver 580+); llama.cpp b10731 needs CUDA 12.8 (driver 570+)'],
              solutions: ['Update the NVIDIA driver to 580+, or set `VLLM_IMAGE=vllm/vllm-openai:v0.28.0-cu129` on drivers 550–579', 'Check container CUDA version in error message', 'After driver update: `sudo systemctl restart docker`'],
            },
            {
              title: 'Models directory not found',
              causes: ["`{{MODELS_DIR}}` doesn't exist", 'Permission denied to create directory', 'Wrong path in Cortex configuration'],
              solutions: ['Create directory: `sudo mkdir -p {{MODELS_DIR}}`', 'Set ownership: `sudo chown -R $USER:$USER {{MODELS_DIR}}`', 'Verify Docker compose mounts the correct path', 'Check `CORTEX_MODELS_DIR` in `.env` (compose mounts it at `/var/cortex/models` inside the gateway)'],
            },
            {
              title: 'Docker container cannot reach Cortex (timeout)',
              causes: ['UFW firewall blocking Docker bridge traffic', 'Missing `extra_hosts` configuration', 'Cortex gateway not running'],
              solutions: ['Run: `make setup-firewall` (one-time setup for UFW)', "Add `extra_hosts: ['host.docker.internal:host-gateway']` to docker-compose", 'Verify Cortex is running: `make status`', 'Test connectivity: `curl {{GATEWAY_URL}}/health`'],
            },
          ],
        },
      ],
    },
    {
      id: 'requirements',
      title: 'System Requirements Summary',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Operating System', md: '**Linux** — Ubuntu 22.04 / 24.04 or RHEL 9\n**Kernel** — 5.4+ (for GPU support)\n**x86_64** — 64-bit architecture' },
            { title: 'Docker', md: '**Docker Engine** — Version 24+\n**Docker Compose** — Version 2.0+\n**NVIDIA Toolkit** — For GPU containers' },
            { title: 'GPU (for inference)', md: '**NVIDIA GPU** — Compute capability 7.0+\n**Driver** — 580+ for vLLM v0.28.0 (CUDA 13); 570+ for llama.cpp\n**VRAM** — Varies by model size' },
            { title: 'Memory', md: '**System RAM** — 8 GB minimum for the stack; models need more\n**GPU VRAM** — 8 GB+ recommended\n**Swap** (optional) — Helps with large models' },
            { title: 'Storage', md: '**Disk Space** — 50 GB+ for models\n**SSD/NVMe** (optional) — Faster model loading\n**Models Dir** — `{{MODELS_DIR}}`' },
            { title: 'Network', md: '**Port {{GATEWAY_PORT}}** — API gateway (host network)\n**Port {{FRONTEND_PORT}}** — Admin UI (default 3001; `FRONTEND_PORT` in `.env`)\n**HuggingFace** (optional) — For online model downloads' },
          ],
        },
      ],
    },
    {
      id: 'full-diagnostic',
      title: 'Run Full Diagnostic',
      intro: 'Copy and run this script to perform a comprehensive environment check:',
      blocks: [
        { kind: 'code', lang: 'bash', label: 'Diagnostic script', text: DIAGNOSTIC_SCRIPT },
        { kind: 'callout', variant: 'info', md: 'Run this script and share the output if you need help troubleshooting environment issues.' },
      ],
    },
    {
      id: 'resources',
      title: 'Additional Resources',
      blocks: [
        {
          kind: 'link-cards',
          items: [
            { title: 'NVIDIA Driver Guide', md: 'Detailed driver update instructions', href: '{{DOCS_URL}}operations/UPDATE_NVIDIA_DRIVERS/' },
            { title: 'Docker GPU Setup', md: 'NVIDIA Container Toolkit docs', href: 'https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/overview.html' },
            { title: 'vLLM Requirements', md: 'GPU compatibility matrix', href: 'https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html' },
          ],
        },
      ],
    },
  ],
  attribution: 'Cortex Environment Diagnostics',
};

export const gettingStarted: GuideTabGroup = {
  id: 'getting-started',
  title: 'Getting Started',
  intro: 'Your guide to deploying and managing LLMs with Cortex. Start here to understand the platform, spin up your first model, and verify your environment is properly configured.',
  tabs: [
    { ...welcomeTab, label: 'Welcome', icon: '👋' },
    { ...firstModelTab, label: 'First Model', icon: '🚀' },
    { ...diagnosticsTab, label: 'Environment', icon: '🔧' },
  ],
};
