import * as path from "node:path";

export type WhisperModelId = "small" | "large-v3-turbo-q8" | "large-v3-turbo";

export interface WhisperModelDef {
  id: WhisperModelId;
  filename: string;
  url: string;
  label: string;
  description: string;
  sizeLabel: string;
}

export const WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "small",
    filename: "ggml-small.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    label: "Small",
    description: "Fast, lower resource usage",
    sizeLabel: "~465 MB",
  },
  {
    id: "large-v3-turbo-q8",
    filename: "ggml-large-v3-turbo-q8_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin",
    label: "Medium",
    description: "Near-best accuracy, quantized for lower memory",
    sizeLabel: "~874 MB",
  },
  {
    id: "large-v3-turbo",
    filename: "ggml-large-v3-turbo.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    label: "Large",
    description: "Best accuracy, high resource usage",
    sizeLabel: "~1.6 GB",
  },
];

export const DEFAULT_MODEL_ID: WhisperModelId = "small";

export function getModelDef(id: WhisperModelId): WhisperModelDef {
  return WHISPER_MODELS.find((m) => m.id === id) ?? WHISPER_MODELS[0]!;
}

/**
 * Model is stored in a persistent `models/` subdirectory inside the whisper
 * data directory (userData/whisper) so it survives app updates.
 */
export function resolveModelPath(whisperDataDir: string, model: WhisperModelDef): string {
  return path.join(whisperDataDir, "models", model.filename);
}
