'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../../src/components/UI';
import { cn } from '../../../../../src/lib/cn';
import { useToast } from '../../../../../src/providers/ToastProvider';
import { safeCopyToClipboard } from '../../../../../src/lib/clipboard';

export default function EnvironmentDiagnostics() {
  const { addToast } = useToast();

  const copyToClipboard = async (text: string, label: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: `${label} copied!`, kind: 'success' });
    } else {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-white/5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔧</span>
            <h2 className="text-lg font-bold text-white">Environment Diagnostics</h2>
          </div>
          <p className="text-[13px] text-white/80 leading-relaxed">
            This guide helps you verify your Linux environment is properly configured for running Cortex and GPU-accelerated 
            inference engines. Most deployment issues trace back to driver problems, missing dependencies, or misconfigured Docker.
          </p>
        </div>
      </Card>

      {/* Quick Health Check */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Quick Health Check</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Run these commands to quickly verify your system is ready for Cortex:
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DiagnosticCommand 
              title="NVIDIA Driver Status"
              command="nvidia-smi"
              successIndicator="GPU info displayed with driver version"
              failureIndicator="Command not found or driver error"
              onCopy={copyToClipboard}
            />
            <DiagnosticCommand 
              title="Docker Running"
              command="docker ps"
              successIndicator="List of containers (even if empty)"
              failureIndicator="Cannot connect to Docker daemon"
              onCopy={copyToClipboard}
            />
            <DiagnosticCommand 
              title="Docker GPU Access"
              command="docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi"
              successIndicator="GPU info displayed inside container"
              failureIndicator="GPU access denied or CUDA error"
              onCopy={copyToClipboard}
            />
            <DiagnosticCommand 
              title="Models Directory"
              command="ls -la /var/cortex/models"
              successIndicator="Directory exists with your model folders"
              failureIndicator="No such directory or permission denied"
              onCopy={copyToClipboard}
            />
          </div>

          <div className="flex gap-3">
            <Link href="/health">
              <Button variant="cyan" size="sm" className="text-[10px]">
                Check System Health Page →
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* NVIDIA Drivers */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">NVIDIA Driver Requirements</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Cortex uses Docker containers with CUDA libraries. Your host system needs compatible NVIDIA drivers 
            to provide GPU access to these containers.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Requirements Table */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Minimum Requirements</div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-white/50">
                    <th className="pb-2">CUDA Version</th>
                    <th className="pb-2">Min Driver</th>
                  </tr>
                </thead>
                <tbody className="text-white/70">
                  <tr className="border-t border-white/5">
                    <td className="py-2">CUDA 12.9+</td>
                    <td className="py-2 text-emerald-300 font-mono">575.51.03</td>
                  </tr>
                  <tr className="border-t border-white/5">
                    <td className="py-2">CUDA 12.8</td>
                    <td className="py-2 font-mono">525.60.13</td>
                  </tr>
                  <tr className="border-t border-white/5">
                    <td className="py-2">CUDA 12.6-12.7</td>
                    <td className="py-2 font-mono">525.60.13</td>
                  </tr>
                </tbody>
              </table>
              <InfoBox variant="blue" className="text-[10px] p-2">
                Most recent vLLM and llama.cpp images use CUDA 12.9+, requiring driver 575 or newer.
              </InfoBox>
            </div>

            {/* Check Commands */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Check Your Driver</div>
              <CommandWithOutput 
                command="nvidia-smi --query-gpu=driver_version --format=csv,noheader"
                description="Shows your current driver version"
                onCopy={copyToClipboard}
              />
              <CommandWithOutput 
                command="nvidia-smi --query-gpu=cuda_version --format=csv,noheader"
                description="Shows max CUDA version your driver supports"
                onCopy={copyToClipboard}
              />
            </div>
          </div>

          {/* Update Instructions */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-300">⚠️</span>
              <div className="text-[11px] font-bold text-amber-300">Need to Update Drivers?</div>
            </div>
            <div className="text-[11px] text-white/70 space-y-2">
              <p>If your driver is below the required version, update using your distribution's package manager:</p>
              <CommandWithOutput 
                command="sudo apt update && sudo apt install nvidia-driver-575"
                description="Ubuntu/Debian - install driver 575"
                onCopy={copyToClipboard}
              />
              <p className="text-white/50 text-[10px]">
                ⚡ Reboot required after driver update. See the{' '}
                <a href="https://aulendurforge.github.io/Cortex/operations/UPDATE_NVIDIA_DRIVERS/" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
                  full driver update guide
                </a>{' '}for detailed instructions.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Docker & NVIDIA Container Toolkit */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Docker & GPU Access</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Docker needs the NVIDIA Container Toolkit to pass GPU access into containers. This is essential for 
            running vLLM and llama.cpp inference engines.
          </p>

          <div className="space-y-4">
            {/* Check Docker */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">1. Verify Docker is Running</div>
              <CommandWithOutput 
                command="sudo systemctl status docker"
                description="Should show 'active (running)'"
                onCopy={copyToClipboard}
              />
              <CommandWithOutput 
                command="docker --version"
                description="Should show Docker version 20.10+"
                onCopy={copyToClipboard}
              />
            </div>

            {/* Check NVIDIA Container Toolkit */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">2. Verify NVIDIA Container Toolkit</div>
              <CommandWithOutput 
                command="nvidia-container-cli --version"
                description="Should show toolkit version"
                onCopy={copyToClipboard}
              />
            </div>

            {/* Install Toolkit */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
              <div className="text-[11px] font-bold text-blue-300">Install NVIDIA Container Toolkit (if missing)</div>
              <div className="space-y-2 text-[11px] text-white/70">
                <CommandWithOutput 
                  command="curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
                  description="Add NVIDIA GPG key"
                  onCopy={copyToClipboard}
                />
                <CommandWithOutput 
                  command={`curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list`}
                  description="Add repository"
                  onCopy={copyToClipboard}
                />
                <CommandWithOutput 
                  command="sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit"
                  description="Install toolkit"
                  onCopy={copyToClipboard}
                />
                <CommandWithOutput 
                  command="sudo systemctl restart docker"
                  description="Restart Docker to apply changes"
                  onCopy={copyToClipboard}
                />
              </div>
            </div>

            {/* Test GPU in Container */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">3. Test GPU Access in Docker</div>
              <CommandWithOutput 
                command="docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi"
                description="Should show your GPUs inside the container"
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* Firewall Setup for External Access */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Firewall Setup (Linux/UFW)</SectionTitle>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Cortex gateway runs with <strong className="text-white">host network mode</strong> for universal access. 
            On Linux systems with UFW firewall enabled, you need to allow Docker container traffic to reach host services.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">One-Time Setup</div>
              <CommandWithOutput 
                command="make setup-firewall"
                description="Run from Cortex directory (requires sudo)"
                onCopy={copyToClipboard}
              />
              <div className="text-[10px] text-white/50 leading-relaxed">
                Or manually: <code className="bg-black/30 px-1 rounded text-cyan-300">sudo bash scripts/setup-docker-firewall.sh</code>
              </div>
              <InfoBox variant="blue" className="text-[10px] p-2">
                This adds a UFW rule to allow traffic from Docker networks (172.16.0.0/12) to host services. 
                It does NOT expose any ports to external networks.
              </InfoBox>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">After Setup: Access Methods</div>
              <div className="space-y-2 text-[10px]">
                <div className="p-2 bg-black/30 rounded-lg border border-white/10">
                  <span className="text-white/80 font-semibold">Docker Containers:</span>
                  <code className="text-cyan-300 ml-2 font-mono">http://host.docker.internal:8084</code>
                  <div className="text-white/40 text-[9px] mt-1">Requires extra_hosts in docker-compose</div>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/10">
                  <span className="text-white/80 font-semibold">LAN Devices:</span>
                  <code className="text-cyan-300 ml-2 font-mono">http://HOST_IP:8084</code>
                  <div className="text-white/40 text-[9px] mt-1">Replace HOST_IP with your server's LAN IP</div>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/10">
                  <span className="text-white/80 font-semibold">Same Machine:</span>
                  <code className="text-cyan-300 ml-2 font-mono">http://localhost:8084</code>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Test External Access</div>
            <CommandWithOutput 
              command="make test-external-access"
              description="Run diagnostic to verify Docker containers can reach Cortex"
              onCopy={copyToClipboard}
            />
          </div>
        </Card>
      </section>

      {/* Common Issues */}
      <section className="space-y-3">
        <SectionTitle variant="red" className="text-[10px]">Common Environment Issues</SectionTitle>
        <div className="space-y-4">
          <IssueCard 
            issue="nvidia-smi: command not found"
            causes={[
              "NVIDIA drivers not installed",
              "Drivers installed but not loaded",
              "System rebooted after failed installation"
            ]}
            solutions={[
              "Install drivers: sudo apt install nvidia-driver-575",
              "Verify installation: dpkg -l | grep nvidia",
              "Check kernel module: lsmod | grep nvidia",
              "Reboot if drivers were just installed"
            ]}
            color="red"
          />

          <IssueCard 
            issue="Docker: permission denied"
            causes={[
              "User not in docker group",
              "Docker daemon not running",
              "Socket permissions incorrect"
            ]}
            solutions={[
              "Add user to docker group: sudo usermod -aG docker $USER",
              "Log out and log back in for group changes to apply",
              "Start Docker: sudo systemctl start docker",
              "Or use sudo for Docker commands"
            ]}
            color="amber"
          />

          <IssueCard 
            issue="GPU not accessible in container"
            causes={[
              "NVIDIA Container Toolkit not installed",
              "Docker not configured for GPU",
              "Incompatible CUDA version",
              "--gpus flag not passed to container"
            ]}
            solutions={[
              "Install NVIDIA Container Toolkit (see above)",
              "Restart Docker after toolkit installation",
              "Update NVIDIA driver to support container CUDA version",
              "Cortex handles --gpus automatically—check logs for errors"
            ]}
            color="purple"
          />

          <IssueCard 
            issue="CUDA version mismatch"
            causes={[
              "Driver too old for container's CUDA version",
              "Container requires CUDA 12.9+ but driver only supports 12.8"
            ]}
            solutions={[
              "Update NVIDIA driver to 575+ for CUDA 12.9 support",
              "Check container CUDA version in error message",
              "After driver update: sudo systemctl restart docker"
            ]}
            color="blue"
          />

          <IssueCard 
            issue="Models directory not found"
            causes={[
              "/var/cortex/models doesn't exist",
              "Permission denied to create directory",
              "Wrong path in Cortex configuration"
            ]}
            solutions={[
              "Create directory: sudo mkdir -p /var/cortex/models",
              "Set ownership: sudo chown -R $USER:$USER /var/cortex/models",
              "Verify Docker compose mounts the correct path",
              "Check CORTEX_MODELS_DIR_HOST environment variable"
            ]}
            color="emerald"
          />

          <IssueCard 
            issue="Docker container cannot reach Cortex (timeout)"
            causes={[
              "UFW firewall blocking Docker bridge traffic",
              "Missing extra_hosts configuration",
              "Cortex gateway not running"
            ]}
            solutions={[
              "Run: make setup-firewall (one-time setup for UFW)",
              "Add extra_hosts: ['host.docker.internal:host-gateway'] to docker-compose",
              "Verify Cortex is running: make status",
              "Test connectivity: curl http://HOST_IP:8084/health"
            ]}
            color="cyan"
          />
        </div>
      </section>

      {/* System Requirements Summary */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">System Requirements Summary</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <RequirementCard 
              category="Operating System"
              items={[
                { label: 'Linux', required: true, detail: 'Ubuntu 20.04+, Debian 11+, RHEL 8+' },
                { label: 'Kernel', required: true, detail: '5.4+ (for GPU support)' },
                { label: 'x86_64', required: true, detail: '64-bit architecture' },
              ]}
            />
            <RequirementCard 
              category="Docker"
              items={[
                { label: 'Docker Engine', required: true, detail: 'Version 20.10+' },
                { label: 'Docker Compose', required: true, detail: 'Version 2.0+' },
                { label: 'NVIDIA Toolkit', required: true, detail: 'For GPU containers' },
              ]}
            />
            <RequirementCard 
              category="GPU (for inference)"
              items={[
                { label: 'NVIDIA GPU', required: true, detail: 'Compute capability 7.0+' },
                { label: 'Driver', required: true, detail: '575+ for CUDA 12.9' },
                { label: 'VRAM', required: true, detail: 'Varies by model size' },
              ]}
            />
            <RequirementCard 
              category="Memory"
              items={[
                { label: 'System RAM', required: true, detail: '16 GB minimum' },
                { label: 'GPU VRAM', required: true, detail: '8 GB+ recommended' },
                { label: 'Swap', required: false, detail: 'Helps with large models' },
              ]}
            />
            <RequirementCard 
              category="Storage"
              items={[
                { label: 'Disk Space', required: true, detail: '50 GB+ for models' },
                { label: 'SSD/NVMe', required: false, detail: 'Faster model loading' },
                { label: 'Models Dir', required: true, detail: '/var/cortex/models' },
              ]}
            />
            <RequirementCard 
              category="Network"
              items={[
                { label: 'Port 8084', required: true, detail: 'API Gateway' },
                { label: 'Port 3001', required: true, detail: 'Admin UI' },
                { label: 'HuggingFace', required: false, detail: 'For online model downloads' },
              ]}
            />
          </div>
        </Card>
      </section>

      {/* Diagnostic Script */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Run Full Diagnostic</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Copy and run this script to perform a comprehensive environment check:
          </p>

          <div className="bg-black/50 rounded-lg border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10">
              <span className="text-[10px] text-white/50">Diagnostic Script</span>
              <button 
                onClick={() => copyToClipboard(diagnosticScript, 'Diagnostic script')}
                className="text-[9px] text-cyan-400 hover:text-cyan-300"
              >
                Copy
              </button>
            </div>
            <pre className="p-3 text-[10px] text-white/80 font-mono overflow-x-auto whitespace-pre-wrap">
              {diagnosticScript}
            </pre>
          </div>

          <InfoBox variant="blue" className="text-[10px] p-2">
            Run this script and share the output if you need help troubleshooting environment issues.
          </InfoBox>
        </Card>
      </section>

      {/* Support Links */}
      <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
        <div className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Additional Resources</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ResourceLink 
            title="NVIDIA Driver Guide"
            description="Detailed driver update instructions"
            href="https://aulendurforge.github.io/Cortex/operations/UPDATE_NVIDIA_DRIVERS/"
          />
          <ResourceLink 
            title="Docker GPU Setup"
            description="NVIDIA Container Toolkit docs"
            href="https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/overview.html"
          />
          <ResourceLink 
            title="vLLM Requirements"
            description="GPU compatibility matrix"
            href="https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html"
          />
        </div>
      </Card>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Environment Diagnostics • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Diagnostic script constant
const diagnosticScript = `#!/bin/bash
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
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "Docker GPU test failed"
echo ""
echo "--- Models Directory ---"
ls -la /var/cortex/models 2>/dev/null || echo "/var/cortex/models not found"
echo ""
echo "--- Disk Space ---"
df -h /var/cortex 2>/dev/null || df -h /
echo ""
echo "=== End Diagnostic ==="`;

// Helper Components
function DiagnosticCommand({ 
  title, 
  command, 
  successIndicator, 
  failureIndicator,
  onCopy 
}: { 
  title: string; 
  command: string; 
  successIndicator: string;
  failureIndicator: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-white">{title}</div>
        <button 
          onClick={() => onCopy(command, title)}
          className="text-[9px] text-cyan-400 hover:text-cyan-300"
        >
          Copy
        </button>
      </div>
      <code className="block text-[10px] text-cyan-300 bg-black/50 p-2 rounded font-mono">
        {command}
      </code>
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div className="text-emerald-400">✓ {successIndicator}</div>
        <div className="text-red-400">✗ {failureIndicator}</div>
      </div>
    </div>
  );
}

function CommandWithOutput({ 
  command, 
  description,
  onCopy 
}: { 
  command: string; 
  description: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[10px] text-cyan-300 bg-black/50 px-2 py-1.5 rounded font-mono overflow-x-auto">
          {command}
        </code>
        <button 
          onClick={() => onCopy(command, description)}
          className="shrink-0 p-1.5 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/70"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
      <div className="text-[9px] text-white/40 pl-2">{description}</div>
    </div>
  );
}

function IssueCard({ 
  issue, 
  causes, 
  solutions,
  color 
}: { 
  issue: string; 
  causes: string[];
  solutions: string[];
  color: string;
}) {
  const colors: Record<string, string> = {
    red: 'border-l-red-500 bg-red-500/5',
    amber: 'border-l-amber-500 bg-amber-500/5',
    blue: 'border-l-blue-500 bg-blue-500/5',
    purple: 'border-l-purple-500 bg-purple-500/5',
    emerald: 'border-l-emerald-500 bg-emerald-500/5',
  };
  const headerColors: Record<string, string> = {
    red: 'text-red-300',
    amber: 'text-amber-300',
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    emerald: 'text-emerald-300',
  };

  return (
    <Card className={cn("p-4 border-l-4", colors[color])}>
      <div className="space-y-3">
        <h3 className={cn("text-[12px] font-bold uppercase tracking-wider", headerColors[color])}>
          {issue}
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Likely Causes</div>
            <ul className="space-y-1 text-[10px] text-white/60">
              {causes.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5">?</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Solutions</div>
            <ul className="space-y-1 text-[10px] text-white/70">
              {solutions.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 mt-0.5">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RequirementCard({ 
  category, 
  items 
}: { 
  category: string; 
  items: { label: string; required: boolean; detail: string }[];
}) {
  return (
    <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
      <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">{category}</div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-[10px]">
            <div className="flex items-center gap-2">
              <span className={item.required ? 'text-emerald-400' : 'text-white/40'}>
                {item.required ? '●' : '○'}
              </span>
              <span className="text-white/80">{item.label}</span>
            </div>
            <div className="text-[9px] text-white/40 ml-4">{item.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceLink({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="block p-3 bg-black/30 rounded-lg border border-white/10 hover:border-cyan-500/30 transition-colors"
    >
      <div className="text-[11px] font-bold text-cyan-300">{title}</div>
      <div className="text-[10px] text-white/50">{description}</div>
    </a>
  );
}

