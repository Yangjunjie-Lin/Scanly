export async function executeTaskGraph(nodes, context, mode = "sequential") {
    const pending = new Map(nodes.map((node) => [node.id, node]));
    const complete = new Set();
    while (pending.size) {
        if (context.signal?.aborted)
            throw Object.assign(new Error("Capture graph cancelled."), { name: "AbortError" });
        const ready = [...pending.values()].filter((node) => node.dependencies.every((id) => complete.has(id)));
        if (!ready.length)
            throw new Error("Capture graph has a cycle or a missing dependency.");
        const batch = mode === "parallel" ? ready : ready.slice(0, 1);
        await Promise.all(batch.map(async (node) => { await node.run(context); pending.delete(node.id); complete.add(node.id); }));
    }
}
//# sourceMappingURL=operator.js.map