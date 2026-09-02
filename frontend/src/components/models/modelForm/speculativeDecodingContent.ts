/**
 * Prose for the Speculative Decoding explainer, kept as data so the component only renders.
 * Paragraph text may use `**bold**` runs; everything else is plain text.
 */

export type ExplainerItem = {
  title?: string;
  text: string;
  /** Small mono line under the text (paths, examples). */
  code?: string;
  /** Right-aligned pill, e.g. the engine default of a parameter. */
  badge?: string;
  /** Bullet tips rendered under the text. */
  tips?: string[];
  icon?: string;
};

export type ExplainerBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'callout'; tone: 'purple' | 'amber' | 'blue'; title?: string; text: string }
  | { kind: 'list'; style: 'numbered' | 'bullets' | 'cards'; items: ExplainerItem[] }
  | { kind: 'code'; comment?: string; lines: string[]; caption?: string; footer?: string }
  | { kind: 'table'; rows: Array<[label: string, value: string]> };

export type ExplainerSection = { title: string; icon: string; blocks: ExplainerBlock[] };

export const SPECULATIVE_DECODING_TITLE = 'Speculative Decoding Explained';
export const SPECULATIVE_DECODING_SUBTITLE = 'Speed up your LLM inference with a clever trick';

export const SPECULATIVE_DECODING_SECTIONS: ExplainerSection[] = [
  {
    title: 'What is Speculative Decoding?',
    icon: '🤔',
    blocks: [
      { kind: 'paragraph', text: '**Speculative decoding** is a technique that can make your AI model generate text **1.5x to 3x faster** without any loss in quality.' },
      { kind: 'paragraph', text: "Here's the simple idea: Instead of having your big, smart (but slow) model generate one token at a time, you use a **small, fast \"draft\" model** to quickly predict multiple tokens ahead. Then your main model checks these predictions all at once and either accepts them or corrects them." },
      {
        kind: 'callout',
        tone: 'purple',
        title: 'Think of it like this:',
        text: "Imagine you're writing an important document. Instead of thinking hard about every single word, you have an assistant who quickly suggests the next few words. You can then quickly approve their suggestions (very fast!) or write your own words when they're wrong (normal speed). Since the assistant is often right, you save a lot of time overall.",
      },
    ],
  },
  {
    title: 'Why Use Speculative Decoding?',
    icon: '✨',
    blocks: [
      {
        kind: 'list',
        style: 'cards',
        items: [
          { icon: '⚡', title: 'Faster Generation', text: 'Get 1.5x to 3x speedup on text generation, especially noticeable for longer outputs.' },
          { icon: '🎯', title: 'Same Quality', text: 'The output is mathematically identical to running without speculative decoding - no quality loss.' },
          { icon: '💰', title: 'Better Resource Usage', text: 'Get more throughput from your existing hardware without upgrading your GPU.' },
          { icon: '🔧', title: 'Easy to Configure', text: 'Just add a draft model path and optionally tune two simple parameters.' },
        ],
      },
      {
        kind: 'callout',
        tone: 'amber',
        text: '**Best results:** Speculative decoding works best when the draft model is from the same "family" as your main model (e.g., both are Mistral, both are Llama). The draft model should be 4-10x smaller than your main model.',
      },
    ],
  },
  {
    title: 'What You Need',
    icon: '📋',
    blocks: [
      {
        kind: 'list',
        style: 'numbered',
        items: [
          { title: 'A Main Model (Large)', text: "Your primary GGUF model that you want to speed up. This is the 'smart' model that produces the final output.", code: 'e.g., Mistral-Small-24B-Q4_K_M.gguf' },
          { title: 'A Draft Model (Small)', text: "A smaller, faster GGUF model from the same family. This model 'guesses' tokens for the main model to verify.", code: 'e.g., Mistral-Small-0.5B-Q8_0.gguf' },
          { title: 'Enough VRAM', text: "You need enough GPU memory to load BOTH models simultaneously. The draft model is small, so this usually isn't a problem.", code: 'e.g., Main: 12GB + Draft: 1GB = 13GB total' },
        ],
      },
    ],
  },
  {
    title: 'Example Setup: Directory Structure',
    icon: '📁',
    blocks: [
      { kind: 'paragraph', text: "Here's a real-world example showing how to organize your models for speculative decoding. In this example, we'll use a 24B main model with a 0.5B draft model." },
      {
        kind: 'code',
        comment: '# Your models directory (mounted as /models in the container)',
        lines: [
          '/var/cortex/models/',
          '    ├── Mistral-Small-24B-Instruct-GGUF/          ← Main model folder (select this)',
          '    │   ├── config.json                            ← Model config (optional)',
          '    │   ├── tokenizer.json                         ← Tokenizer (optional if using HF repo)',
          '    │   ├── Mistral-Small-24B-Q4_K_M.gguf          ← Your main GGUF file',
          '    │   └── ...                                    (other quantization options)',
          '    │',
          '    └── Mistral-Small-0.5B-DRAFT-GGUF/            ← Draft model folder',
          '        ├── config.json',
          '        └── Mistral-Small-0.5B-Q8_0.gguf           ← Draft GGUF (use this path)',
        ],
        caption: 'Container path for Draft Model Path field:',
        footer: '/models/Mistral-Small-0.5B-DRAFT-GGUF/Mistral-Small-0.5B-Q8_0.gguf',
      },
      {
        kind: 'list',
        style: 'cards',
        items: [
          { icon: '📦', title: 'Main Model Folder', text: 'Contains your large model that you want to accelerate. This is what you select in the "Select your model item" dropdown.' },
          { icon: '🚀', title: 'Draft Model Folder', text: 'Contains the small, fast model. You provide the full container path to this in the "Draft Model Path" field.' },
        ],
      },
    ],
  },
  {
    title: 'How to Configure',
    icon: '⚙️',
    blocks: [
      {
        kind: 'list',
        style: 'numbered',
        items: [
          { title: 'Select your main model', text: "In the Model Selection step, choose your main model folder (e.g., 'Mistral-Small-24B-Instruct-GGUF')." },
          { title: 'Open Speculative Decoding settings', text: "In the Core Settings step (llama.cpp), expand the 'Speculative decoding' section." },
          { title: 'Enter the draft model path', text: 'Enter the draft model path relative to the models directory (Cortex maps it to /models/... in the container).', code: 'Mistral-Small-0.5B-DRAFT-GGUF/Mistral-Small-0.5B-Q8_0.gguf' },
          { title: '(Optional) Tune parameters', text: "Adjust 'Draft tokens (max/min)', 'Draft acceptance p_min', the speculative type and the draft model GPU layers if needed. Empty fields use llama.cpp defaults." },
        ],
      },
    ],
  },
  {
    title: 'Understanding the Parameters',
    icon: '🎛️',
    blocks: [
      {
        kind: 'list',
        style: 'bullets',
        items: [
          {
            title: 'Draft model (--model-draft)',
            text: 'Path to the draft GGUF relative to the models directory; Cortex mounts that directory at /models inside the container.',
            badge: 'Default: (none - required)',
            tips: ['Use a model from the same family as your main model', 'Draft model should be 4-10x smaller than main model', 'Use Q8_0 quantization for the draft model for best accuracy'],
          },
          {
            title: 'Draft tokens max (--spec-draft-n-max)',
            text: 'How many tokens the draft model predicts ahead at each step. Higher values mean more aggressive speculation.',
            badge: 'Default: 3 (engine default)',
            tips: ['3-8 is good for most use cases (llama.cpp default is 3)', 'Higher values (24-32) can help with predictable text like code', 'Lower values (4-8) if you notice many rejected predictions'],
          },
          {
            title: 'Draft acceptance p_min (--spec-draft-p-min)',
            text: 'How confident the draft model needs to be before its prediction is considered. Lower = more aggressive, higher = more conservative.',
            badge: 'Default: engine default',
            tips: ['0.5 is a good balance for most cases', 'Try 0.3-0.4 for higher throughput (may reduce acceptance rate)', 'Try 0.6-0.7 if you want very accurate speculation only'],
          },
        ],
      },
    ],
  },
  {
    title: 'Troubleshooting',
    icon: '🔍',
    blocks: [
      {
        kind: 'list',
        style: 'bullets',
        items: [
          { icon: '❌', title: "Model won't start / out of memory", text: "✓ You don't have enough VRAM for both models. Try using a more quantized (smaller) version of either model, or disable speculative decoding." },
          { icon: '❌', title: 'Not seeing any speedup', text: '✓ The draft model may be too different from the main model. Try a draft model from the same family. Also, speculative decoding helps less with very short responses.' },
          { icon: '❌', title: 'Getting errors about draft model path', text: '✓ Make sure the path starts with /models/ and points to the actual .gguf file, not just the folder. Check for typos in the filename.' },
          { icon: '❌', title: 'Output quality seems different', text: "✓ This shouldn't happen with speculative decoding. If it does, you may have a compatibility issue. Try a different draft model or disable the feature." },
        ],
      },
    ],
  },
  {
    title: 'Quick Reference Card',
    icon: '📖',
    blocks: [
      {
        kind: 'table',
        rows: [
          ['Main Model Size', '7B - 70B+ (your large model)'],
          ['Draft Model Size', '0.5B - 3B (4-10x smaller than main)'],
          ['Expected Speedup', '1.5x - 3x faster generation'],
          ['Quality Impact', 'None (mathematically identical output)'],
          ['Extra VRAM Needed', '~0.5GB - 2GB for draft model'],
          ['Best For', 'Long text generation, code, conversations'],
        ],
      },
    ],
  },
];
