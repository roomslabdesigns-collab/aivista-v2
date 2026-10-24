const key = process.env.NVIDIA_API_KEY!;
const list = (await (await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { authorization: `Bearer ${key}` } })).json()).data.map((m: any) => m.id);
const wanted = list.filter((id: string) => /kimi|deepseek|glm|qwen3|llama-3\.3|llama-4|gpt-oss|nemotron-3|mistral-large|gemma/i.test(id) && !/vl|vision|embed|reward|safety|guard|coder|nano|omni/i.test(id));
console.log(`catalog: ${list.length} models; trying ${wanted.length}`);
for (const id of wanted) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: "Name one CRM." }], max_tokens: 20 }),
      signal: AbortSignal.timeout(40000),
    });
    console.log(`${res.ok ? "OK  " : res.status + " "} ${id} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`ERR  ${id} ${(e as Error).message.slice(0, 40)}`);
  }
}
