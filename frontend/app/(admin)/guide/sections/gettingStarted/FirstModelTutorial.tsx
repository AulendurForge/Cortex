'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { HostIpDisplay, useHostIP } from '@/components/HostIpDisplay';
import { cn } from '@/lib/cn';
import { useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { Attribution } from '../Attribution';

export default function FirstModelTutorial() {
  const hostIP = useHostIP();
  const { addToast } = useToast();
  const [selectedModel, setSelectedModel] = useState<'phi-2' | 'gemma'>('phi-2');

  const copyToClipboard = async (text: string, label: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: `${label} copied!`, kind: 'success' });
    } else {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  const modelInfo = {
    'phi-2': {
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
    'gemma': {
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
  };

  const model = modelInfo[selectedModel];

  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border-white/5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🎯</span>
            <h2 className="text-lg font-bold text-white">Spin Up Your First Model</h2>
          </div>
          <p className="text-[13px] text-white/80 leading-relaxed">
            This hands-on tutorial walks you through the complete workflow: downloading a model from HuggingFace, 
            adding it to Cortex, and making your first API request. By the end, you'll have a working chat model 
            serving requests on your network.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px]">~15 minutes</Badge>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px]">Beginner Friendly</Badge>
          </div>
        </div>
      </Card>

      {/* Model Selection */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Step 1: Choose a Starter Model</SectionTitle>
        <p className="text-[12px] text-white/70 leading-relaxed">
          We recommend starting with a small model to learn the workflow. Here are two excellent options:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModelOptionCard 
            model="phi-2"
            selected={selectedModel === 'phi-2'}
            onSelect={() => setSelectedModel('phi-2')}
            info={modelInfo['phi-2']}
          />
          <ModelOptionCard 
            model="gemma"
            selected={selectedModel === 'gemma'}
            onSelect={() => setSelectedModel('gemma')}
            info={modelInfo['gemma']}
          />
        </div>

        {model.gated && (
          <InfoBox variant="warning" className="text-[11px] p-3">
            <strong>Access Required:</strong> This model requires accepting the license on HuggingFace. Visit{' '}
            <a href={model.hfUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">
              {model.hfUrl}
            </a>{' '}and click "Agree and access repository" before proceeding.
          </InfoBox>
        )}
      </section>

      {/* Prerequisites */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Step 2: Verify Prerequisites</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Before downloading the model, ensure your system is ready:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChecklistCard title="Required" items={[
              { label: 'Git LFS installed', command: 'git lfs install', detail: 'Required for large file downloads' },
              { label: 'Models directory exists', command: 'sudo mkdir -p /var/cortex/models', detail: 'Where Cortex stores model files' },
              { label: 'Write permissions', command: 'sudo chown -R $USER:$USER /var/cortex/models', detail: 'Your user needs write access' },
            ]} />
            
            <ChecklistCard title="Recommended" items={[
              { label: 'HuggingFace CLI', command: 'pip install huggingface_hub', detail: 'For token management' },
              { label: `At least ${model.vram} VRAM`, command: 'nvidia-smi', detail: 'Check your GPU memory' },
              { label: '~10 GB disk space', command: 'df -h /var/cortex', detail: 'For model files and cache' },
            ]} />
          </div>

          <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
            <div className="text-[10px] font-bold text-cyan-300">Quick Setup Commands</div>
            <div className="space-y-2">
              <CommandBlock 
                command="sudo apt-get install -y git-lfs && git lfs install"
                label="Install Git LFS"
                onCopy={copyToClipboard}
              />
              <CommandBlock 
                command="sudo mkdir -p /var/cortex/models && sudo chown -R $USER:$USER /var/cortex/models"
                label="Create models directory"
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* Download Model */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Step 3: Download the Model</SectionTitle>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Clone the model repository directly from HuggingFace into your models directory:
          </p>

          <div className="space-y-3">
            <div className="p-3 bg-black/30 rounded-lg border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-emerald-300">
                  Navigate to models directory
                </div>
              </div>
              <CommandBlock 
                command="cd /var/cortex/models"
                label="Change directory"
                onCopy={copyToClipboard}
              />
            </div>

            {model.gated && (
              <div className="p-3 bg-black/30 rounded-lg border border-amber-500/20 space-y-3">
                <div className="text-[10px] font-bold text-amber-300">
                  Login to HuggingFace (for gated models)
                </div>
                <CommandBlock 
                  command="huggingface-cli login"
                  label="HF login"
                  onCopy={copyToClipboard}
                />
                <div className="text-[10px] text-white/50">
                  Enter your HuggingFace token when prompted. Get a token at{' '}
                  <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
                    huggingface.co/settings/tokens
                  </a>
                </div>
              </div>
            )}

            <div className="p-3 bg-black/30 rounded-lg border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-emerald-300">
                  Clone the model ({model.name})
                </div>
                <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">~{model.params} params</Badge>
              </div>
              <CommandBlock 
                command={`git clone https://huggingface.co/${model.hfRepo}`}
                label="Clone command"
                onCopy={copyToClipboard}
              />
              <div className="text-[10px] text-white/50">
                This downloads all model files. Size varies but expect 3-6 GB for these small models.
              </div>
            </div>

            <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-3">
              <div className="text-[10px] font-bold text-white/80">
                Verify the download
              </div>
              <CommandBlock 
                command={`ls -la /var/cortex/models/${model.folderName}`}
                label="List files"
                onCopy={copyToClipboard}
              />
              <div className="text-[10px] text-white/50">
                You should see files like <code className="text-cyan-300 bg-black/30 px-1 rounded">config.json</code>,{' '}
                <code className="text-cyan-300 bg-black/30 px-1 rounded">tokenizer.json</code>, and{' '}
                <code className="text-cyan-300 bg-black/30 px-1 rounded">*.safetensors</code> or <code className="text-cyan-300 bg-black/30 px-1 rounded">*.bin</code> files.
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Add Model in Cortex */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Step 4: Add the Model in Cortex</SectionTitle>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Now return to the Cortex interface to register and configure the model:
          </p>

          <div className="space-y-4">
            <StepInstruction step={1} title="Open the Models Page">
              <p className="text-[11px] text-white/70">
                Navigate to{' '}
                <Link href="/models" className="text-blue-300 underline">Models</Link>{' '}
                in the sidebar, or click the button below.
              </p>
              <Link href="/models" className="inline-block mt-2">
                <Button variant="default" size="sm" className="text-[10px]">
                  Go to Models Page →
                </Button>
              </Link>
            </StepInstruction>

            <StepInstruction step={2} title="Click 'Add Model'">
              <p className="text-[11px] text-white/70">
                Click the <span className="inline-flex items-center px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-[10px] font-bold"><span aria-hidden="true" className="mr-1">➕</span>Add Model</span>{' '}
                button in the top right corner. This opens the model configuration wizard.
              </p>
            </StepInstruction>

            <StepInstruction step={3} title="Configure Engine & Mode">
              <div className="space-y-2">
                <p className="text-[11px] text-white/70">Select these options:</p>
                <ul className="text-[11px] text-white/70 ml-4 space-y-1">
                  <li>• <strong>Engine:</strong> <span className="text-blue-300">vLLM</span> (best for SafeTensor models)</li>
                  <li>• <strong>Mode:</strong> <span className="text-purple-300">Offline</span> (we're using local files)</li>
                </ul>
              </div>
            </StepInstruction>

            <StepInstruction step={4} title="Select the Model Folder">
              <div className="space-y-2">
                <p className="text-[11px] text-white/70">
                  In the Model Selection step:
                </p>
                <ol className="text-[11px] text-white/70 ml-4 space-y-1">
                  <li>1. Check the read-only <strong>Models directory</strong> (set by <code className="text-cyan-300 bg-black/30 px-1 rounded">CORTEX_MODELS_DIR</code>)</li>
                  <li>2. Click <strong>Refresh</strong> to list its folders</li>
                  <li>3. Select <code className="text-cyan-300 bg-black/30 px-1 rounded">{model.folderName}</code> from the dropdown</li>
                </ol>
                <InfoBox variant="blue" className="text-[10px] p-2 mt-2">
                  <strong>Note:</strong> Cortex maps your <code>/var/cortex/models</code> host directory to <code>/models</code> inside containers.
                </InfoBox>
              </div>
            </StepInstruction>

            <StepInstruction step={5} title="Configure Core Settings">
              <div className="space-y-2">
                <p className="text-[11px] text-white/70">Set these key parameters:</p>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <SettingItem 
                    label="Name" 
                    value={model.name}
                    detail="Display name in Cortex"
                  />
                  <SettingItem 
                    label="Served Model Name" 
                    value={model.folderName}
                    detail="API identifier"
                  />
                  <SettingItem 
                    label="Task" 
                    value="generate"
                    detail="Chat/completion model"
                  />
                  <SettingItem 
                    label="GPU" 
                    value="Select one GPU"
                    detail="Pick any available GPU"
                  />
                  <SettingItem 
                    label="Max model length" 
                    value="2048"
                    detail="Start small; empty = the model's own maximum"
                  />
                  <SettingItem 
                    label="GPU memory utilization" 
                    value="0.92 (default)"
                    detail="Leave empty for the default; lower it on a shared GPU"
                  />
                </div>
              </div>
            </StepInstruction>

            <StepInstruction step={6} title="Launch the Model">
              <p className="text-[11px] text-white/70">
                Skip the optional steps (Startup Config, Request Defaults) and go to <strong>Summary</strong>. 
                Click <span className="text-emerald-300 font-bold">Launch Model</span> to create the configuration.
              </p>
            </StepInstruction>
          </div>

          <InfoBox variant="cyan" className="text-[11px] p-3">
            <strong>Memory Allocation Tips:</strong> If the model fails to start with OOM errors, try reducing 
            <code className="bg-black/30 px-1 mx-1 rounded">Max model length</code> or{' '}
            <code className="bg-black/30 px-1 mx-1 rounded">GPU memory utilization</code>. Start conservative and increase once working.
          </InfoBox>
        </Card>
      </section>

      {/* Start and Test */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Step 5: Start and Test Your Model</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <div className="space-y-4">
            <StepInstruction step={1} title="Start the Model">
              <p className="text-[11px] text-white/70">
                In the Models table, find your model row and click the <span className="text-emerald-300 font-bold">Start</span> button. 
                The state badge will change from <code>stopped</code> → <code>starting</code> → <code>loading</code> → <code>running</code> (or <code>failed</code>, with the reason in the badge and Logs). While it is loading, the Stop button reads <strong>Cancel</strong>.
              </p>
              <InfoBox variant="blue" className="text-[10px] p-2 mt-2">
                First startup takes longer as Docker pulls the inference engine image. Subsequent starts are faster.
              </InfoBox>
            </StepInstruction>

            <StepInstruction step={2} title="Monitor Progress">
              <p className="text-[11px] text-white/70">
                Click the <span className="text-cyan-300 font-bold">Logs</span> button to watch startup progress. 
                You'll see messages about loading model weights into GPU memory. Wait for "Model loaded successfully" or similar.
              </p>
            </StepInstruction>

            <StepInstruction step={3} title="Run the Built-in Test">
              <p className="text-[11px] text-white/70">
                Once the model is <code>running</code>, click the <span className="text-purple-300 font-bold">Test</span> button. 
                This sends a simple prompt and reports whether the model answered and how long the round trip took.
              </p>
            </StepInstruction>
          </div>
        </Card>
      </section>

      {/* Chat and API */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Step 6: Chat & API Access</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Your model is now live! Here's how to interact with it:
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chat Playground */}
            <Card className="p-4 bg-black/30 border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">💬</span>
                <div className="text-[12px] font-bold text-white">Chat Playground</div>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                The easiest way to test—go to the Chat page and select your model from the dropdown. 
                Type messages and see responses in real-time.
              </p>
              <Link href="/chat">
                <Button variant="cyan" size="sm" className="text-[10px] w-full">
                  Open Chat Playground →
                </Button>
              </Link>
            </Card>

            {/* API Endpoint */}
            <Card className="p-4 bg-black/30 border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">🔌</span>
                <div className="text-[12px] font-bold text-white">API Endpoint</div>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Send requests from any application using the OpenAI-compatible API with an API key from the
                All API Keys / My API Keys page. (The dev stack sets <code>GATEWAY_DEV_ALLOW_ALL_KEYS=true</code>, which also
                accepts requests that carry no key at all.)
              </p>
              <div className="text-[10px] font-mono text-cyan-300 bg-black/50 p-2 rounded break-all">
                {`http://${hostIP || 'YOUR_IP'}:8084/v1/chat/completions`}
              </div>
            </Card>
          </div>

          {/* curl Example */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-white/80">Example: API Request with curl</div>
            <div className="bg-black/50 rounded-lg border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10">
                <span className="text-[10px] text-white/50">Terminal</span>
                <button 
                  onClick={() => copyToClipboard(
                    `curl -X POST http://${hostIP || 'YOUR_IP'}:8084/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model.folderName}",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100
  }'`,
                    'curl command'
                  )}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300"
                >
                  Copy
                </button>
              </div>
              <pre className="p-3 text-[10px] text-white/80 font-mono overflow-x-auto">
{`curl -X POST http://${hostIP || 'YOUR_IP'}:8084/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model.folderName}",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100
  }'`}
              </pre>
            </div>
            <div className="text-[10px] text-white/50">
              Replace <code className="text-amber-300">YOUR_API_KEY</code> with a key from the{' '}
              <Link href="/keys" className="text-cyan-300 underline">API Keys</Link> page.
              In the dev stack (<code>GATEWAY_DEV_ALLOW_ALL_KEYS=true</code>) a request without an Authorization header is accepted too.
            </div>
          </div>

          {/* Python Example */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-white/80">Example: Python with OpenAI SDK</div>
            <div className="bg-black/50 rounded-lg border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10">
                <span className="text-[10px] text-white/50">Python</span>
                <button 
                  onClick={() => copyToClipboard(
                    `from openai import OpenAI

client = OpenAI(
    base_url="http://${hostIP || 'YOUR_IP'}:8084/v1",
    api_key="YOUR_API_KEY"  # from the API Keys page
)

response = client.chat.completions.create(
    model="${model.folderName}",
    messages=[{"role": "user", "content": "Hello, who are you?"}],
    max_tokens=100
)

print(response.choices[0].message.content)`,
                    'Python code'
                  )}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300"
                >
                  Copy
                </button>
              </div>
              <pre className="p-3 text-[10px] text-white/80 font-mono overflow-x-auto">
{`from openai import OpenAI

client = OpenAI(
    base_url="http://${hostIP || 'YOUR_IP'}:8084/v1",
    api_key="YOUR_API_KEY"  # from the API Keys page
)

response = client.chat.completions.create(
    model="${model.folderName}",
    messages=[{"role": "user", "content": "Hello, who are you?"}],
    max_tokens=100
)

print(response.choices[0].message.content)`}
              </pre>
            </div>
          </div>
        </Card>
      </section>

      {/* Success & Next Steps */}
      <Card className="p-5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border-emerald-500/20 space-y-4">
        <div className="flex items-start gap-4">
          <div className="text-3xl" aria-hidden="true">🎉</div>
          <div className="space-y-3">
            <h3 className="text-[14px] font-bold text-white">Congratulations!</h3>
            <p className="text-[12px] text-white/70 leading-relaxed">
              You've successfully deployed your first LLM with Cortex. You now know the complete workflow 
              from downloading a model to serving API requests. Here are some next steps to explore:
            </p>
            <ul className="text-[12px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400" aria-hidden="true">→</span>
                <span>Try a <strong className="text-white">larger model</strong> like Llama 3.1 8B (needs ~16GB VRAM)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400" aria-hidden="true">→</span>
                <span>Deploy an <strong className="text-white">embedding model</strong> for RAG applications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400" aria-hidden="true">→</span>
                <span>Create <strong className="text-white">API keys</strong> for team members</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400" aria-hidden="true">→</span>
                <span>Explore <strong className="text-white">llama.cpp</strong> for GGUF quantized models</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Troubleshooting Quick Tips */}
      <InfoBox variant="warning" className="text-[11px] p-4">
        <strong>Having Issues?</strong> Check the <strong className="text-white">Environment Diagnostics</strong> tab 
        for common setup problems, or see the{' '}
        <Link href="/guide?tab=manage-models#troubleshooting" className="text-cyan-300 underline">
          Model Troubleshooting Guide
        </Link>{' '}for deployment-specific issues.
      </InfoBox>

      <Attribution label="Cortex First Model Tutorial" />
    </section>
  );
}

// Helper Components
function ModelOptionCard({ 
  model, 
  selected, 
  onSelect, 
  info 
}: { 
  model: string; 
  selected: boolean; 
  onSelect: () => void;
  info: {
    name: string;
    hfRepo: string;
    hfUrl: string;
    params: string;
    vram: string;
    description: string;
    license: string;
    gated: boolean;
  };
}) {
  return (
    <Card 
      className={cn(
        "p-4 cursor-pointer transition-all duration-300 border-2",
        selected 
          ? "bg-cyan-500/10 border-cyan-500/50" 
          : "bg-white/[0.02] border-white/5 hover:border-white/20"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[13px] font-bold text-white">{info.name}</div>
          <div className="text-[10px] text-white/50 font-mono">{info.hfRepo}</div>
        </div>
        <div className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
          selected ? "border-cyan-400 bg-cyan-500/20" : "border-white/30"
        )}>
          {selected && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />}
        </div>
      </div>
      
      <p className="text-[11px] text-white/60 leading-relaxed mb-3">{info.description}</p>
      
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px]">{info.params}</Badge>
        <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px]">{info.vram}</Badge>
        <Badge className={cn(
          "text-[9px]",
          info.gated 
            ? "bg-amber-500/10 text-amber-300 border-amber-500/20" 
            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
        )}>
          {info.gated ? 'Gated Access' : 'Open Access'}
        </Badge>
      </div>
    </Card>
  );
}

function ChecklistCard({ title, items }: { title: string; items: { label: string; command: string; detail: string }[] }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{title}</div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] text-white/70">
            <div className="flex items-start gap-2">
              <span className="text-cyan-400" aria-hidden="true">□</span>
              <div>
                <div className="font-medium">{item.label}</div>
                <code className="text-[10px] text-cyan-300 bg-black/30 px-1 rounded">{item.command}</code>
                <div className="text-[10px] text-white/40">{item.detail}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommandBlock({ 
  command, 
  label, 
  onCopy 
}: { 
  command: string; 
  label: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-[11px] text-cyan-300 bg-black/50 px-3 py-2 rounded font-mono overflow-x-auto">
        {command}
      </code>
      <button 
        onClick={() => onCopy(command, label)}
        className="shrink-0 p-2 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/70"
        title="Copy to clipboard"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  );
}

function StepInstruction({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold text-blue-300">
        {step}
      </div>
      <div className="flex-1 space-y-2">
        <div className="text-[12px] font-bold text-white">{title}</div>
        {children}
      </div>
    </div>
  );
}

function SettingItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="p-2 bg-black/30 rounded border border-white/10">
      <div className="text-[10px] text-white/50">{label}</div>
      <div className="text-[11px] text-cyan-300 font-medium">{value}</div>
      <div className="text-[9px] text-white/40">{detail}</div>
    </div>
  );
}

