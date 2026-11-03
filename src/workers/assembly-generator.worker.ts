import type { GeneratorRequest, GeneratorResponse } from "../domain/generator.ts";
import { generateAssembly } from "../lib/assembly-generator.ts";
import { checkGeneratedDocument } from "../lib/assembly-analysis.ts";

const worker = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<GeneratorRequest>) => void): void;
  postMessage(message: GeneratorResponse): void;
};

worker.addEventListener("message", ({ data }) => {
  try {
    if (data?.type !== "generate") { worker.postMessage({ type: "error" }); return; }
    const result = generateAssembly(data.document, data.options);
    if (result.status === "success" && !checkGeneratedDocument(data.document, result.document, data.options)) {
      worker.postMessage({ type: "error" });
      return;
    }
    worker.postMessage({ type: "result", result });
  } catch {
    worker.postMessage({ type: "error" });
  }
});
