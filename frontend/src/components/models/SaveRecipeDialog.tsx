'use client';

import React, { useState } from 'react';
import { Modal } from '../Modal';
import { Button, Input, TextArea, SectionTitle, InfoBox, FormField } from '../UI';
import { useToast } from '../../providers/ToastProvider';
import apiFetch from '../../lib/api-clients';

interface SaveRecipeDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  modelId: number;
  modelName: string;
  engineType: string;
}

export function SaveRecipeDialog({ 
  open, 
  onClose, 
  onSuccess, 
  modelId, 
  modelName, 
  engineType 
}: SaveRecipeDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      addToast({ title: 'Blueprint name required', kind: 'error' });
      return;
    }

    setIsLoading(true);
    
    try {
      await apiFetch(`/admin/recipes/from-model/${modelId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null
        })
      });

      addToast({ 
        title: 'Blueprint cataloged!', 
        kind: 'success' 
      });
      
      setName('');
      setDescription('');
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const msg = (error as { message?: string })?.message || 'Unknown error';
      addToast({ title: 'Could not save recipe', description: msg, kind: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setName('');
      setDescription('');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Blueprint Generation" variant="center">
      <div className="p-4 space-y-4">
        <header className="space-y-1">
          <SectionTitle variant="purple">Configuration Source</SectionTitle>
          <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white uppercase tracking-wider">{modelName}</span>
              <span className="text-[9px] text-white/30 uppercase font-black tracking-widest">{engineType} engine</span>
            </div>
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs">💾</div>
          </div>
        </header>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Blueprint Name" description="Give this configuration a unique name for identification.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Optimized Llama-3"
              disabled={isLoading}
              required
            />
          </FormField>
          
          <FormField label="Strategy Description" description="Optional notes on requirements or use-cases.">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] py-2"
              placeholder="Recommended for A100-80GB clusters..."
              disabled={isLoading}
            />
          </FormField>
          
          <InfoBox variant="cyan" className="text-[10px] p-2">
            Cataloging this blueprint will preserve all engine flags and sampling defaults.
          </InfoBox>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
            <Button 
              type="button" 
              variant="default"
              size="sm"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              variant="primary"
              size="sm"
              disabled={isLoading || !name.trim()}
              className="px-6 shadow-lg shadow-indigo-500/20"
            >
              {isLoading ? 'Processing...' : 'Catalog Blueprint'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
