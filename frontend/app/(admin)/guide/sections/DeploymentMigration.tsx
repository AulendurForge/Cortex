'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../src/components/UI';
import { cn } from '../../../../src/lib/cn';

export default function DeploymentMigration() {
  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Transfer &amp; Offline Deployment</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Move engine images, model weights, the Cortex program itself and (optionally) the database from an online host
          to an air-gapped one on a USB drive. The <strong className="text-white">Transfer</strong> page does the whole
          round trip: export on the online host, import on the offline host.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20">Bundles</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Export (online host)</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Import (offline host)</Badge>
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">CLI equivalents</Badge>
      </div>

      {/* Workflow */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Round trip</div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <WorkflowStep num={1} label="Mount drive" color="indigo" />
          <Arrow />
          <WorkflowStep num={2} label="Transfer → Export" color="purple" />
          <Arrow />
          <WorkflowStep num={3} label="Carry the drive" color="blue" />
          <Arrow />
          <WorkflowStep num={4} label="Transfer → Import" color="cyan" />
          <Arrow />
          <WorkflowStep num={5} label="Start model" color="emerald" />
        </div>
      </Card>

      {/* What is a bundle */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="purple" className="text-[10px]">What is a bundle?</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] text-white/70 leading-relaxed">
              A bundle is a plain folder — no archive, no special tools — that the gateway writes to the drive. Everything the
              offline host needs is inside it, and a <code className="text-cyan-300">README.txt</code> explains how to use it
              without Cortex. Bundles are self-describing: the Import tab reads <code className="text-cyan-300">bundle.json</code>
              and shows what is inside before anything is touched.
            </p>
            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>Exact engine images.</strong> Every model records the exact engine image it runs on (for example
              <code className="mx-1">vllm/vllm-openai:v0.28.1</code>). Exports ship that exact tag — never <code>latest</code> — so
              the model starts on the offline host with the same engine it was tested with. Selecting a model in the Export
              tab automatically adds its image.
            </InfoBox>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-2">Folder layout</div>
            <pre className="rounded-xl bg-black/40 border border-white/10 p-3 text-[11px] font-mono text-white/80 leading-relaxed overflow-x-auto">{`cortex-bundle-20260901-1200/
├── bundle.json            what is inside, source host, Cortex version
├── images.json            image list with sizes and sha256
├── images/*.tar           docker images (docker save)
├── models/<served>/
│   ├── manifest.json      model config + exact engine image
│   └── files/…            weights (when "Include model files" is on)
├── db/cortex.sql          pg_dump (only with "Include database dump")
├── checksums.sha256       sha256 of every file
└── README.txt             manual instructions`}</pre>
          </div>
        </div>
      </Card>

      {/* Export */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="cyan" className="text-[10px]">Online host: export</SectionTitle>
        <ol className="space-y-3 text-[12px] text-white/70">
          <StepItem num={1}>
            <strong className="text-white">Mount the drive.</strong> Plug in the USB drive and mount it under
            <code className="mx-1">/media</code> or <code className="mx-1">/mnt</code> on the host (desktop file managers do this
            automatically, e.g. <code>/media/usb</code>). The gateway sees these directories and lists them as destinations.
          </StepItem>
          <StepItem num={2}>
            <strong className="text-white">Make it writable by the gateway.</strong> The gateway runs as the non-root user
            <code className="mx-1">uid 1000</code>, so the destination must be writable by that user. The gateway fixes its own
            exports directory automatically. For a USB drive formatted <strong>ext4</strong> run
            <code className="mx-1">sudo chown 1000 /media/usb/&lt;dir&gt;</code> once; <strong>exFAT / NTFS</strong> drives are
            world-writable already. The Export tab shows the reason when a location is not usable.
          </StepItem>
          <StepItem num={3}>
            <strong className="text-white">Open Transfer → Export</strong> and pick the destination and a bundle name.
          </StepItem>
          <StepItem num={4}>
            <strong className="text-white">Choose what to include:</strong> engine images (any extra tag can be typed in),
            infrastructure images for a fresh install, the Cortex program images for offline rebuilds, the models with or
            without their files, and optionally the database dump (users, API keys, organisations, model configs).
          </StepItem>
          <StepItem num={5}>
            <strong className="text-white">Review and start.</strong> The live estimate compares the bundle size with the free
            space on the drive and lists warnings (images that will be pulled first, models without local files). Progress,
            throughput and the log are shown while the job runs; it keeps running if you leave the page.
          </StepItem>
          <StepItem num={6}>
            <strong className="text-white">Unmount</strong> (<code>sudo umount /media/usb</code>) and carry the drive to the
            offline host.
          </StepItem>
        </ol>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OptionExplainer label="Include model files" recommended desc="Copies the weights. Turn off to ship only the configuration when the offline host already has the files." />
          <OptionExplainer label="Pull missing images" recommended desc="Downloads images that are not in the local Docker cache before saving them. Turn off on a host without internet." />
          <OptionExplainer label="Include database dump" recommended={false} desc="Full pg_dump. Only needed to clone the whole instance (users, keys, orgs); restored separately on the other side." />
        </div>
      </Card>

      {/* Import */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="blue" className="text-[10px]">Offline host: import</SectionTitle>
        <ol className="space-y-3 text-[12px] text-white/70">
          <StepItem num={1}>
            <strong className="text-white">Mount the drive</strong> under <code className="mx-1">/media</code> or
            <code className="mx-1">/mnt</code>. Read-only is fine for importing.
          </StepItem>
          <StepItem num={2}>
            <strong className="text-white">Open Transfer → Import</strong>, pick the bundle (or type its path) and press
            <strong className="mx-1">Scan</strong>. The scan shows every image (already loaded / will load / file missing), every
            model (files in bundle / already on host, engine image available, already registered) and checks free space in the
            models directory and Docker.
          </StepItem>
          <StepItem num={3}>
            <strong className="text-white">Choose a conflict strategy</strong> for models that already exist here:
            <em className="mx-1">rename</em> (default, registers <code>name-2</code>), <em>skip</em>, <em>replace</em> the
            configuration, or <em>stop on conflict</em>. Optionally verify checksums first — it reads every file once, so it is
            slow for big bundles.
          </StepItem>
          <StepItem num={4}>
            <strong className="text-white">Start the import.</strong> Images are loaded with <code>docker load</code>, model files
            are copied into the models directory and the models are registered (stopped). The result lists each model with
            its new id.
          </StepItem>
          <StepItem num={5}>
            <strong className="text-white">Start the model</strong> on the Models page — the exact engine image from the bundle is
            already loaded, so no download happens.
          </StepItem>
        </ol>
        <InfoBox variant="amber" className="text-[11px]">
          <strong>Database restore</strong> is deliberately separate: it replaces users, API keys and model registrations on this
          host. Find it under <em>Advanced: restore database from bundle</em> at the bottom of the Import tab; it asks for
          confirmation and can take a backup first.
        </InfoBox>
      </Card>

      {/* CLI */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="indigo" className="text-[10px]">Command-line equivalents</SectionTitle>
        <p className="text-[12px] text-white/70 leading-relaxed">
          The same bundle format is produced and consumed by the Makefile targets, which is handy for the very first install on
          a machine that does not run Cortex yet.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CliCard cmd="make prepare-offline" desc="Online host: build the program bundle in cortex-offline-bundle/ with every pinned image, the Cortex images and the dependency images + wheels." />
          <CliCard cmd="make load-offline BUNDLE=<path>" desc="Offline host: load every image tar from a bundle (UI export or prepare-offline) into Docker, e.g. BUNDLE=/media/usb/cortex-bundle-20260901-1200." />
          <CliCard cmd="make build-offline" desc="Offline host: rebuild the gateway and UI from modified source on top of the dependency images, with --network none." />
        </div>
      </Card>

      {/* Troubleshooting */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="amber" className="text-[10px]">Troubleshooting</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TroubleshootItem issue="The drive is not listed as a destination" solution="It must be mounted under /media, /mnt or /run/media on the host before the gateway container can see it. Mount it, then press Refresh." />
          <TroubleshootItem issue="Location shown as 'not writable by the gateway (uid 1000)'" solution="ext4/xfs drives keep Linux ownership: sudo chown 1000 <mount point or folder>. exFAT/NTFS/FAT drives take ownership from the mount options; remount with uid=1000 or use a folder that is world-writable." />
          <TroubleshootItem issue="Export says an image will be pulled but the host is offline" solution="Only cached images can be exported offline. Turn off 'Pull missing images', pick a cached tag from the list, or run the export on a host with internet." />
          <TroubleshootItem issue="Import: models directory is not writable" solution="The import error shows the exact command (sudo chown 1000 <models dir> on the host, top level only). Alternatively turn off 'Copy model files' and place the files by hand." />
          <TroubleshootItem issue="Model imported but cannot start" solution="Check the Models page: the engine image recorded in the model must be loaded (docker images). Re-import with the image selected, or load it with make load-offline." />
          <TroubleshootItem issue="A job is stuck or the page shows a job you did not start" solution="Only one transfer job runs at a time and it is shown at the top of the Transfer page. Cancel stops it after the current file; delete the partial bundle folder before retrying." />
        </div>
      </Card>

      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          <div>
            <div className="text-white/80 font-semibold mb-1">Default paths (container)</div>
            <code className="text-cyan-300 text-[10px]">
              Exports: /var/cortex/exports<br />
              Models: /var/cortex/models<br />
              Drives: /host/media, /host/mnt, /host/run/media
            </code>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Typical sizes</div>
            <div className="text-white/60 text-[10px]">
              vLLM engine image: 10–20 GB<br />
              llama.cpp image: 2–4 GB<br />
              Model weights: 4–140 GB each
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Go to Transfer</div>
            <Link href="/deployment">
              <Button variant="cyan" size="sm" className="mt-1 text-[10px]">Open Transfer →</Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Transfer Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function WorkflowStep({ num, label, color }: { num: number; label: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  };
  return (
    <div className={cn('px-3 py-1.5 rounded-lg border font-bold', colors[color])}>
      <span className="opacity-60">{num}.</span> {label}
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30">→</span>;
}

function StepItem({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/70">
        {num}
      </span>
      <div className="flex-1 leading-relaxed">{children}</div>
    </li>
  );
}

function OptionExplainer({ label, recommended, desc }: { label: string; recommended: boolean; desc: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={cn('text-[10px] font-bold', recommended ? 'text-emerald-300' : 'text-white/60')}>{label}</span>
        {recommended && (
          <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[8px]">Default on</Badge>
        )}
      </div>
      <div className="text-[10px] text-white/50 leading-relaxed">{desc}</div>
    </div>
  );
}

function CliCard({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-1.5">
      <code className="block text-[11px] text-cyan-300 font-mono break-all">$ {cmd}</code>
      <div className="text-[10px] text-white/60 leading-relaxed">{desc}</div>
    </div>
  );
}

function TroubleshootItem({ issue, solution }: { issue: string; solution: string }) {
  return (
    <Card className="p-3 bg-white/[0.02] border-white/5">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-sm mt-0.5">?</span>
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-white">{issue}</div>
          <div className="text-[11px] text-white/60 leading-relaxed">{solution}</div>
        </div>
      </div>
    </Card>
  );
}
