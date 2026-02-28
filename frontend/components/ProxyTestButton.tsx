"use client";

import { useState } from "react";

export default function ProxyTestButton() {
  const [response, setResponse] = useState<string>("Click the button to test");
  const [loading, setLoading] = useState(false);

  const testProxy = async () => {
    setLoading(true);
    try {
      // CRITICAL: Notice how we are NOT using http://localhost:8000 here!
      // We are fetching from the Next.js server, which will use the
      // next.config.mjs rewrites to proxy it to FastAPI.
      const res = await fetch("/api/v1/ping");

      if (res.ok) {
        const data = await res.json();
        setResponse(`${data.message} (Time: ${data.time})`);
      } else {
        setResponse(`Error: HTTP ${res.status}`);
      }
    } catch (error) {
      setResponse("Failed to fetch. Check console for details.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-8 p-6 bg-zinc-100 rounded-xl border border-zinc-200">
      <h2 className="text-lg font-semibold text-zinc-800">
        BFF Proxy Test (Client Side)
      </h2>
      <p className="text-sm text-zinc-600 text-center max-w-xs">
        This button fetches from{" "}
        <code className="bg-zinc-200 px-1 rounded">/api/v1/ping</code>. Next.js
        intercepts it and proxies it to FastAPI.
      </p>

      <button
        onClick={testProxy}
        disabled={loading}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? "Pinging..." : "Ping FastAPI"}
      </button>

      <div className="text-sm font-mono bg-zinc-800 text-green-400 p-3 rounded w-full text-center">
        {response}
      </div>
    </div>
  );
}
