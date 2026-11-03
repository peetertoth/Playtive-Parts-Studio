import { parentPort } from "node:worker_threads";

// Supply the browser worker surface while executing the actual production module.
globalThis.self = {
  addEventListener(_type, listener) { parentPort.on("message", (data) => listener({ data })); },
  postMessage(message) { parentPort.postMessage(message); },
};
await import("../../src/workers/assembly-generator.worker.ts");
parentPort.postMessage({ type: "ready" });
