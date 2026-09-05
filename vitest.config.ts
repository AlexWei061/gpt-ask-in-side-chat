import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "happy-dom", environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true } } }, clearMocks: true, restoreMocks: true, exclude: ["e2e/**", "node_modules/**", "dist/**"] } });
