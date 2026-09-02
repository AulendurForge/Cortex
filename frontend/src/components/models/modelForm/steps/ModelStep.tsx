'use client';

import React from 'react';
import { OnlineModeFields } from '../OnlineModeFields';
import { OfflineModeFields } from '../OfflineModeFields';
import type { WorkflowCtx } from './types';

/** Step 2 of the Add workflow: Hugging Face repo or local folder + format. */
export function ModelStep({ ctx }: { ctx: WorkflowCtx }) {
  const { values, set } = ctx;
  if (values.mode === 'online') {
    return (
      <div className="space-y-4">
        <OnlineModeFields
          repoId={values.repo_id || ''}
          hfToken={values.hf_token || ''}
          onRepoIdChange={(v) => set('repo_id', v)}
          onHfTokenChange={(v) => set('hf_token', v)}
          modeLocked={ctx.modeLocked}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <OfflineModeFields
        baseDir={ctx.baseDir}
        folders={ctx.folders}
        foldersLoading={ctx.foldersLoading}
        localPath={values.local_path || ''}
        onFolderSelect={ctx.onFolderSelect}
        onRefreshFolders={ctx.refreshFolders}
        inspect={ctx.inspect}
        inspectLoading={ctx.inspectLoading}
        inspectError={ctx.inspectError}
        source={ctx.source}
        onSourceChange={ctx.setSource}
        engineType={values.engine_type}
        onSwitchEngine={ctx.switchEngine}
        onShowMergeHelp={ctx.showMergeHelp}
        tokenizer={values.tokenizer || ''}
        hfConfigPath={values.hf_config_path || ''}
        onTokenizerChange={(v) => set('tokenizer', v)}
        onHfConfigPathChange={(v) => set('hf_config_path', v)}
        modeLocked={ctx.modeLocked}
      />
    </div>
  );
}
