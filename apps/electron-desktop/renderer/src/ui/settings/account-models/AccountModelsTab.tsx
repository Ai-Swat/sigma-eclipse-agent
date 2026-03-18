/**
 * "AI Models" settings tab.
 * Shows Provider/Model selectors with inline API key entry (self-managed only).
 */
import React from "react";

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  resolveProviderIconUrl,
} from "@shared/models/providers";
import { getModelTier, formatModelMeta, TIER_INFO } from "@shared/models/modelPresentation";
import { useModelProvidersState } from "../providers/useModelProvidersState";
import { RichSelect, type RichOption } from "./RichSelect";
import { InlineApiKey } from "./InlineApiKey";
import type { ConfigData } from "@store/slices/configSlice";

import s from "./AccountModelsTab.module.css";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  connected?: boolean;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: ConfigData;
};

function providerBadge(p: (typeof MODEL_PROVIDERS)[number]):
  | {
      text: string;
      variant: string;
    }
  | undefined {
  if (p.recommended) return { text: "Recommended", variant: "recommended" };
  if (p.popular) return { text: "Popular", variant: "popular" };
  if (p.privacyFirst) return { text: "Privacy First", variant: "privacy" };
  return undefined;
}

export function AccountModelsTab(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const state = useModelProvidersState({
    ...props,
    isPaidMode: false,
  });

  const autoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoSelectedRef.current && state.activeProviderKey && !state.providerFilter) {
      autoSelectedRef.current = true;
      state.setProviderFilter(state.activeProviderKey);
    }
  }, [state.activeProviderKey, state.providerFilter, state.setProviderFilter]);

  const selectedProvider = state.providerFilter;
  const selectedProviderInfo = selectedProvider
    ? (MODEL_PROVIDER_BY_ID[selectedProvider] ?? null)
    : null;

  const providerOptions: RichOption<ModelProvider>[] = React.useMemo(
    () =>
      MODEL_PROVIDERS.map((p) => ({
        value: p.id,
        label: p.name,
        icon: resolveProviderIconUrl(p.id),
        description: p.description,
        badge: providerBadge(p),
      })),
    []
  );

  const isSelectedProviderConfigured = selectedProvider
    ? state.isProviderConfigured(selectedProvider)
    : false;

  const modelOptions: RichOption<string>[] = React.useMemo(() => {
    if (!selectedProvider) return [];
    return state.sortedModels
      .filter((m) => m.provider === selectedProvider)
      .map((m) => {
        const tier = getModelTier(m);
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
        };
      });
  }, [selectedProvider, state.sortedModels]);

  const handleProviderChange = React.useCallback(
    (value: ModelProvider) => {
      state.setProviderFilter(value);
    },
    [state.setProviderFilter]
  );

  const handleModelChange = React.useCallback(
    (value: string) => {
      void state.saveDefaultModel(value);
    },
    [state.saveDefaultModel]
  );

  React.useEffect(() => {
    if (
      selectedProvider &&
      modelOptions.length > 0 &&
      !modelOptions.some((opt) => opt.value === state.activeModelId)
    ) {
      handleModelChange(modelOptions[0]!.value);
    }
  }, [selectedProvider, modelOptions, state.activeModelId, handleModelChange]);

  const handleOAuthSuccess = React.useCallback(() => {
    void props.reload();
  }, [props.reload]);

  const configHash = typeof props.configSnap?.hash === "string" ? props.configSnap.hash : null;

  return (
    <div className={s.root}>
      <div className={s.title}>AI Models</div>

      <div className={s.dropdownRow}>
        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Provider</div>
          <RichSelect
            value={selectedProvider}
            onChange={handleProviderChange}
            options={providerOptions}
            placeholder="Select provider…"
            disabled={state.modelsLoading}
          />
        </div>
        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Model</div>
          <RichSelect
            value={state.activeModelId ?? null}
            onChange={handleModelChange}
            options={modelOptions}
            placeholder={
              !selectedProvider
                ? "Select provider first"
                : modelOptions.length === 0
                  ? "Enter API key to choose a model"
                  : "Select model…"
            }
            disabled={
              !selectedProvider ||
              state.modelsLoading ||
              state.modelBusy ||
              modelOptions.length === 0
            }
            disabledStyles={!selectedProvider || modelOptions.length === 0}
          />
        </div>
      </div>

      {selectedProvider && modelOptions.length === 0 && !state.modelsLoading && (
        <div className={s.noModelsHint}>
          {!isSelectedProviderConfigured
            ? "Add an API key below to load models for this provider."
            : "No models loaded. Try restarting the app to refresh the model catalog."}
        </div>
      )}

      {selectedProviderInfo && (
        <InlineApiKey
          provider={selectedProviderInfo}
          configured={state.isProviderConfigured(selectedProvider!)}
          busy={state.busyProvider === selectedProvider}
          onSave={state.saveProviderApiKey}
          onSaveSetupToken={state.saveProviderSetupToken}
          onPaste={state.pasteFromClipboard}
          configHash={configHash}
          onOAuthSuccess={handleOAuthSuccess}
        />
      )}
    </div>
  );
}
