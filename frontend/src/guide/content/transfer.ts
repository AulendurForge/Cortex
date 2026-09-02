/**
 * Transfer & Offline Deployment tab: bundles, the export/import round trip, the Makefile
 * equivalents and troubleshooting. Bundle layout and make targets mirror
 * docs/operations/offline-deployment.md and the Makefile (prepare-offline, load-offline,
 * build-deps, build-offline, import-bundle). Content only — keep facts here, not in TSX.
 */
import type { GuideTab } from '../types';

const BUNDLE_LAYOUT = `cortex-bundle-20260901-1200/
├── bundle.json                 what is inside, Cortex version, source host, creation time
├── images.json                 [{ref, id, size_bytes, file, sha256, role}]
├── images/<ref>.tar            docker save of each image
├── models/<served_name>/
│   ├── manifest.json           model configuration snapshot (no hf_token) + file list with sha256
│   └── files/<folder>/         raw copies of the model folder (when "Include model files" is on)
├── db/cortex.sql               optional pg_dump (only with "Include database dump")
├── wheels/                     optional Python wheelhouse (program bundle only)
├── versions.env                pinned versions the bundle was built from (program bundle only)
├── checksums.sha256            sha256 of every file above: sha256sum -c checksums.sha256
└── README.txt                  human-readable contents and import instructions`;

const FIRST_INSTALL = `cd Cortex
make load-offline BUNDLE=/media/usb/cortex/cortex-offline-bundle   # verifies checksums, docker load, copies model files
echo "OFFLINE_MODE=true" >> .env
make verify-offline                                                 # every pinned image present?
make prod-check && make up ENV=prod                                 # or \`make up\` for the dev stack`;

const REBUILD_OFFLINE = `git apply cortex-fix.patch          # or copy the changed files
make build-offline                  # docker build --network none on top of cortex-*-deps:{{VERSION}}
make up                             # recreate the containers with the new images`;

export const transferTab: GuideTab = {
  id: 'transfer',
  title: 'Transfer & Offline Deployment',
  intro:
    'Move engine images, model weights, the Cortex program itself and (optionally) the database from an online host to an air-gapped one on a USB drive. The **Transfer** page does the whole round trip: export on the online host, import on the offline host.',
  lead: [
    { kind: 'p', md: '**Bundles** · **Export (online host)** · **Import (offline host)** · **CLI equivalents**' },
    { kind: 'p', md: '**Round trip:** 1. Mount drive → 2. Transfer → Export → 3. Carry the drive → 4. Transfer → Import → 5. Start model' },
  ],
  sections: [
    {
      id: 'transfer-bundle',
      title: 'What is a bundle?',
      blocks: [
        { kind: 'p', md: 'A bundle is a plain folder — no archive, no special tools — that the gateway writes to the drive. Everything the offline host needs is inside it, and a `README.txt` explains how to use it without Cortex. Bundles are self-describing: the Import tab reads `bundle.json` and shows what is inside before anything is touched.' },
        { kind: 'callout', variant: 'info', title: 'Exact engine images', md: 'Every model records the exact engine image it runs on (for example `{{VLLM_IMAGE}}`). Exports ship that exact tag — never `latest` — so the model starts on the offline host with the same engine it was tested with. Selecting a model in the Export tab automatically adds its image.' },
        { kind: 'h', level: 3, text: 'Folder layout' },
        { kind: 'code', label: 'Bundle folder', text: BUNDLE_LAYOUT, copy: false },
        { kind: 'p', md: 'The UI export, the UI import, `make prepare-offline` and `make load-offline` all speak this one format. Nothing in a bundle references a floating tag, and a model always carries the exact engine image it was validated with.' },
      ],
    },
    {
      id: 'transfer-export',
      title: 'Online host: export',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Mount the drive', md: 'Plug in the USB drive and mount it under `/media` or `/mnt` on the host (desktop file managers do this automatically, e.g. `/media/usb`). The gateway sees these directories and lists them as destinations.' },
            { title: 'Make it writable by the gateway', md: 'The gateway runs as the non-root user `uid 1000`, so the destination must be writable by that user. The gateway fixes its own exports directory (`{{EXPORT_DIR}}`) automatically. For a USB drive formatted **ext4** run the command below once; **exFAT / NTFS** drives are world-writable already. The Export tab shows the reason when a location is not usable.', code: 'sudo mkdir -p /media/usb/cortex && sudo chown 1000 /media/usb/cortex' },
            { title: 'Open Transfer → Export', md: 'Pick the destination and a bundle name.' },
            { title: 'Choose what to include', md: 'Engine images (any extra tag can be typed in under *Other image*), infrastructure images for a fresh install, the Cortex program images for offline rebuilds, the models with or without their files, and optionally the database dump (users, API keys, organisations, model configs).' },
            { title: 'Review and start', md: 'The live estimate compares the bundle size with the free space on the drive and lists warnings (images that will be pulled first, models without local files). Progress, throughput and the log are shown while the job runs; it keeps running if you leave the page.' },
            { title: 'Unmount and carry the drive to the offline host', code: 'sudo umount /media/usb' },
          ],
        },
        { kind: 'h', level: 3, text: 'Export options' },
        {
          kind: 'table',
          columns: ['Option', 'Default', 'What it does'],
          rows: [
            ['**Include model files**', 'On', 'Copies the weights. Turn off to ship only the configuration when the offline host already has the files.'],
            ['**Pull missing images**', 'On', 'Downloads images that are not in the local Docker cache before saving them. Turn off on a host without internet.'],
            ['**Include database dump**', 'Off', 'Full pg_dump. Only needed to clone the whole instance (users, keys, orgs); restored separately on the other side.'],
          ],
        },
      ],
    },
    {
      id: 'transfer-import',
      title: 'Offline host: import',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Mount the drive', md: 'Mount it under `/media` or `/mnt`. Read-only is fine for importing.' },
            { title: 'Open Transfer → Import', md: 'Pick the bundle (or type its path) and press **Scan**. The scan shows every image (already loaded / will load / file missing), every model (files in bundle / already on host, engine image available, already registered) and checks free space in the models directory and Docker.' },
            { title: 'Choose a conflict strategy', md: 'For models that already exist here: *rename* (default, registers `name-2`), *skip*, *replace* the configuration, or *stop on conflict*. Optionally verify checksums first — it reads every file once, so it is slow for big bundles.' },
            { title: 'Start the import', md: 'Images are loaded with `docker load`, model files are copied into the models directory (`{{MODELS_DIR}}`) and the models are registered (stopped). The result lists each model with its new id.' },
            { title: 'Start the model', md: 'On the [Models page](/models) — the exact engine image from the bundle is already loaded, so no download happens.' },
          ],
        },
        { kind: 'callout', variant: 'warning', title: 'Database restore', md: 'Database restore is deliberately separate: it replaces users, API keys and model registrations on this host. Find it under *Advanced: restore database from bundle* at the bottom of the Import tab; it asks for confirmation and can take a backup first.' },
      ],
    },
    {
      id: 'transfer-cli',
      title: 'Command-line equivalents',
      intro: 'The same bundle format is produced and consumed by the Makefile targets, which is handy for the very first install on a machine that does not run Cortex yet.',
      blocks: [
        {
          kind: 'table',
          columns: ['Command', 'Where', 'What it does'],
          rows: [
            ['`make prepare-offline`', 'Online host', 'Build the program bundle in `cortex-offline-bundle/` with every pinned image, the Cortex images and the dependency images + wheels. Options: `OUTPUT_DIR=/media/usb/cortex/program`, `EXTRA_IMAGES="<tag>"`, `SKIP_WHEELS=1`, `YES=1`.'],
            ['`make build-deps`', 'Online host', 'Build only the dependency images `cortex-gateway-deps:{{VERSION}}` / `cortex-frontend-deps:{{VERSION}}` used for offline rebuilds.'],
            ['`make load-offline BUNDLE=<path>`', 'Offline host', 'Load every image tar from a bundle (UI export or prepare-offline) into Docker and copy the model files, e.g. `BUNDLE=/media/usb/cortex-bundle-20260901-1200`. `make import-bundle` is an alias.'],
            ['`make verify-offline`', 'Offline host', 'Check that every pinned image is present locally.'],
            ['`make build-offline`', 'Offline host', 'Rebuild the gateway and UI from modified source on top of the dependency images, with `--network none`.'],
          ],
        },
        { kind: 'h', level: 3, text: 'First install on an air-gapped host' },
        { kind: 'p', md: 'Copy the **repository** (same version) and the program bundle to the offline host, then:' },
        { kind: 'code', lang: 'bash', label: 'First install', text: FIRST_INSTALL },
        { kind: 'p', md: '`OFFLINE_MODE=true` makes the gateway refuse to pull images: a model whose engine image is not in the cache fails fast with a message naming the tag to import, instead of hanging on a pull.' },
        { kind: 'h', level: 3, text: 'Rebuilding after code changes (offline)' },
        { kind: 'p', md: 'The program bundle ships the dependency images, so source changes can be rebuilt without network:' },
        { kind: 'code', lang: 'bash', label: 'Offline rebuild', text: REBUILD_OFFLINE },
        { kind: 'p', md: '`make build-offline` fails early if the deps images for the current `CORTEX_VERSION` are missing. When *dependencies* change (`requirements.txt` / `package-lock.json`) a new program bundle is needed from a connected host.' },
      ],
    },
    {
      id: 'transfer-troubleshooting',
      title: 'Troubleshooting',
      blocks: [
        {
          kind: 'issues',
          items: [
            {
              title: 'The drive is not listed as a destination',
              causes: ['It is not mounted under `/media`, `/mnt` or `/run/media` on the host', 'It was mounted after the gateway started with a path that did not exist yet'],
              solutions: ['Mount it, then press **Refresh**', 'If the mount point did not exist when the gateway started: `make up` again'],
            },
            {
              title: "Location shown as 'not writable by the gateway (uid 1000)'",
              causes: ['ext4/xfs drives keep Linux ownership', 'exFAT/NTFS/FAT drives take ownership from the mount options'],
              solutions: ['ext4/xfs: `sudo chown 1000 <mount point or folder>` on the host', 'exFAT/NTFS/FAT: remount with `uid=1000` or use a folder that is world-writable'],
            },
            {
              title: 'Export says an image will be pulled but the host is offline',
              causes: ['Only cached images can be exported offline'],
              solutions: ["Turn off 'Pull missing images'", 'Pick a cached tag from the list', 'Or run the export on a host with internet'],
            },
            {
              title: 'Import: models directory is not writable',
              causes: ['The top level of the models directory is not owned by uid 1000'],
              solutions: ['The import error shows the exact command: `sudo chown 1000 {{MODELS_DIR}}` on the host (top level only)', "Alternatively turn off 'Copy model files' and place the files by hand"],
            },
            {
              title: 'Model imported but cannot start',
              causes: ['The engine image recorded in the model is not loaded (check `docker images`)'],
              solutions: ['Check the [Models page](/models) for the image the model expects', 'Re-import with the image selected, or load it with `make load-offline`'],
            },
            {
              title: 'A job is stuck or the page shows a job you did not start',
              causes: ['Only one transfer job runs at a time and it is shown at the top of the Transfer page'],
              solutions: ['Cancel stops it after the current file', 'Delete the partial bundle folder before retrying'],
            },
          ],
        },
      ],
    },
    {
      id: 'transfer-reference',
      title: 'Quick Reference',
      blocks: [
        {
          kind: 'table',
          caption: 'Default paths on the host and inside the gateway container',
          columns: ['What', 'Host path', 'Inside the gateway'],
          rows: [
            ['Exports', '`{{EXPORT_DIR}}`', '`/var/cortex/exports`'],
            ['Models', '`{{MODELS_DIR}}`', '`/var/cortex/models`'],
            ['Drives', '`/media`, `/mnt`, `/run/media`', '`/host/media`, `/host/mnt`, `/host/run/media`'],
          ],
        },
        { kind: 'p', md: '**Typical sizes.** vLLM engine image: 10–20 GB · llama.cpp image: 2–4 GB · Model weights: 4–140 GB each.' },
        {
          kind: 'link-cards',
          items: [
            { title: 'Transfer', md: 'Export and import bundles', href: '/deployment', label: 'Open Transfer' },
            { title: 'Offline deployment', md: 'Full reference for air-gapped installs', href: '{{DOCS_URL}}operations/offline-deployment/', label: 'Read the docs' },
          ],
        },
      ],
    },
  ],
  attribution: 'Cortex Transfer Guide',
};
