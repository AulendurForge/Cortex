# How to Set Custom Environment Variables in Cortex GUI

## Quick Answer

**Location:** In the **Custom Startup Configuration** section, switch to the **"Environment Variables"** tab.

## Step-by-Step Instructions

### Option 1: Standard Model Form

1. Navigate to **Models** → **Add Model** (or edit an existing model)
2. Scroll down past all the standard configuration sections
3. Find the section titled **"⚙️ Custom Startup Configuration (Advanced)"**
4. You'll see two tabs at the top:
   - **Arguments** (for CLI flags like `--async-scheduling`)
   - **Environment Variables** (for env vars like `VLLM_USE_FLASHINFER_MOE_FP8=1`)
5. Click on the **"Environment Variables"** tab
6. Click the **"+ Add Environment Variable"** button
7. Fill in:
   - **Name**: `VLLM_USE_FLASHINFER_MOE_FP8`
   - **Value**: `1`
8. Click **"Add Variable"**
9. Repeat for the second variable:
   - **Name**: `VLLM_FLASHINFER_MOE_BACKEND`
   - **Value**: `throughput`
10. Click **"Add Variable"**

### Option 2: Workflow Form (Multi-Step Wizard)

1. Navigate to **Models** → **Add Model** (if using workflow form)
2. Progress through the steps:
   - Step 1: Engine Selection
   - Step 2: Model Information
   - Step 3: Core Settings
   - **Step 4: Startup** ← This is where you add custom env vars
3. In the **Startup** step, you'll see the Custom Startup Configuration
4. Click the **"Environment Variables"** tab
5. Follow steps 6-10 from Option 1 above

## Visual Guide

### Finding the Section

The **Custom Startup Configuration** section appears:
- **In Standard Form**: At the bottom, after "Request Defaults"
- **In Workflow Form**: In the "Startup" step (Step 4)

### The Interface

```
┌─────────────────────────────────────────────────────────┐
│ ⚙️ Custom Startup Configuration (Advanced)              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Arguments (0)]  [Environment Variables (0)]  ← Tabs │
│                                                         │
│  💡 Common Use Cases:                                   │
│  • Nemotron FP8 MoE: VLLM_USE_FLASHINFER_MOE_FP8=1    │
│  • HuggingFace offline: HF_HUB_OFFLINE=1               │
│  • Logging level: VLLM_LOGGING_LEVEL=DEBUG             │
│                                                         │
│  [+ Add Environment Variable]  ← Click this button     │
└─────────────────────────────────────────────────────────┘
```

### Adding a Variable

When you click **"+ Add Environment Variable"**, you'll see:

```
┌─────────────────────────────────────────────────────────┐
│ Add Environment Variable                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Name *                                                 │
│  [VLLM_USE_FLASHINFER_MOE_FP8________________]        │
│  Environment variable name (uppercase recommended)     │
│                                                         │
│  Value                                                  │
│  [1________________________________________________]    │
│  Value (empty string allowed)                          │
│                                                         │
│  [Cancel]  [Add Variable]  ← Click "Add Variable"     │
└─────────────────────────────────────────────────────────┘
```

## For Nemotron FP8 Model

Add these two environment variables:

### Variable 1:
- **Name**: `VLLM_USE_FLASHINFER_MOE_FP8`
- **Value**: `1`

### Variable 2:
- **Name**: `VLLM_FLASHINFER_MOE_BACKEND`
- **Value**: `throughput`

## After Adding Variables

You'll see them listed like this:

```
┌─────────────────────────────────────────────────────────┐
│ Environment Variables (2)                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  VLLM_USE_FLASHINFER_MOE_FP8=1  [Edit] [Delete]       │
│  VLLM_FLASHINFER_MOE_BACKEND=throughput [Edit] [Delete]│
│                                                         │
│  [+ Add Environment Variable]                          │
└─────────────────────────────────────────────────────────┘
```

## Important Notes

1. **Case Sensitivity**: Environment variable names are case-sensitive. Use uppercase as shown.

2. **Order Doesn't Matter**: You can add them in any order.

3. **Editing**: Click **"Edit"** next to any variable to modify it.

4. **Deleting**: Click **"Delete"** to remove a variable.

5. **Protected Variables**: Some variables are protected and cannot be overridden:
   - `CUDA_VISIBLE_DEVICES` (managed by Cortex)
   - `NCCL_*` (managed by Cortex)
   - `HF_HUB_OFFLINE` (managed by Cortex for offline mode)

6. **Container Restart Required**: Changes to environment variables require restarting the model container to take effect.

## Verification

After saving the model and starting it, you can verify the environment variables are set:

1. Check the model logs - they should show the custom env vars
2. Or inspect the container:
   ```bash
   docker inspect <container-name> | grep -A 50 "Env"
   ```

You should see:
```
"Env": [
  ...
  "VLLM_USE_FLASHINFER_MOE_FP8=1",
  "VLLM_FLASHINFER_MOE_BACKEND=throughput",
  ...
]
```

## Troubleshooting

**Can't find the section?**
- Make sure you've selected an **Engine Type** (vllm or llamacpp)
- Scroll down past all the standard configuration sections
- Look for the cyan-colored section header "⚙️ Custom Startup Configuration"

**Variables not appearing?**
- Make sure you clicked "Add Variable" (not just filled in the form)
- Check that you're on the "Environment Variables" tab, not "Arguments"
- Refresh the page if needed

**Variables not taking effect?**
- Restart the model container after adding/changing env vars
- Check the container logs for any errors
- Verify the variable names are spelled correctly (case-sensitive)
